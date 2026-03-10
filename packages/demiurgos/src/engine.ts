// ============================================================
// DEMIURGOS — Orchestration Engine (The Core Loop)
// ============================================================

import { randomUUID } from 'node:crypto';
import { classifyTaskType, classifyComplexity, classifyDomain, generateContract } from './contracts.js';
import { evaluate, evaluateWithEvidence, weightedThreshold } from './evaluator.js';
import { selectModel, getTiersToTry, tierName } from './router.js';
import { logTask } from './logger.js';
import { TaskCache } from './cache/task-cache.js';
import { Tier } from './types.js';
import type { Task, Result, CostRecord, EvaluationResult, CacheHitType } from './types.js';

// --- Cache Instance ---

let taskCache: TaskCache | null = null;

export function initCache(dbPath = 'demiurgos-vectors.db'): void {
  taskCache = new TaskCache(dbPath);
}

export function getCache(): TaskCache | null {
  return taskCache;
}

// --- Main Execution ---

export async function execute(prompt: string, options?: {
  maxBudget?: number;
  maxTier?: Tier;
  context?: string;
}): Promise<Result> {
  const startTime = Date.now();

  // Step 1: Create task object with classification
  const task = createTask(prompt, options);

  // Step 2: Check cache
  if (taskCache) {
    const cached = taskCache.lookup(prompt);

    if (cached.type === 'exact' && cached.cachedResult) {
      console.log(`  [cache] Exact match (similarity: ${cached.similarity.toFixed(3)}) — FREE`);
      const duration = Date.now() - startTime;
      logTask({
        taskId: task.id,
        prompt: task.prompt,
        result: cached.cachedResult,
        modelUsed: 'cache',
        tier: 0 as Tier,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        qualityScore: 1.0,
        cacheHit: 'exact' as CacheHitType,
        evidenceConfidence: 1.0,
        coherenceConfidence: 1.0,
        totalConfidence: 1.0,
        durationMs: duration,
      });
      return {
        id: randomUUID(),
        taskId: task.id,
        content: cached.cachedResult,
        model: 'cache',
        tier: 0 as Tier,
        cost: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'cache', tier: 0 as Tier },
        evaluation: perfectEvaluation(),
        cached: true,
        duration,
        createdAt: new Date(),
      };
    }

    if (cached.type === 'adapt' && cached.cachedResult) {
      console.log(`  [cache] Close match (similarity: ${cached.similarity.toFixed(3)}) — adapting`);
      // For adaptation, we'll use the cached result as context for a cheap model
      // This is handled below by prepending cached context
      task.context = `Previously answered a similar question: "${cached.cachedPrompt}"\nAnswer: ${cached.cachedResult}\n\nAdapt this for the new question.`;
    }
  }

  // Step 3: Generate contract
  const contract = generateContract(task);

  // Step 4: Try models from cheapest to most expensive
  const tiersToTry = getTiersToTry(task, options?.maxTier as Tier | undefined);

  for (const tier of tiersToTry) {
    const selection = selectModel(tier, task);
    if (!selection) continue;

    const { config, provider } = selection;

    // Check if provider is available
    const available = await provider.isAvailable();
    if (!available) {
      console.log(`  [skip] ${config.id} — not available`);
      continue;
    }

    console.log(`  [try] ${config.id} (${tierName(tier)})`);

    try {
      // Execute
      const systemPrompt = buildSystemPrompt(contract);
      const response = await provider.generate(prompt, systemPrompt, {
        maxTokens: config.maxTokens,
        model: config.model,
      });

      // Calculate cost
      const cost: CostRecord = {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: (response.inputTokens * config.costPerInputToken) +
                 (response.outputTokens * config.costPerOutputToken),
        model: config.id,
        tier,
      };

      // Evaluate against contract
      let evaluation: EvaluationResult;
      if (tier === Tier.LOCAL) {
        // For local models, use heuristic evaluation (no LLM self-eval — 7B models
        // can't reliably produce the strict JSON the evaluator expects)
        evaluation = await evaluateWithEvidence(response.content, contract, null);
      } else {
        const evaluatorSelection = selectModel(Math.max(tier, 1) as Tier, task);
        const evaluatorProvider = evaluatorSelection?.provider ?? provider;
        evaluation = await evaluate(response.content, contract, evaluatorProvider);
      }

      const duration = Date.now() - startTime;

      // Log the task
      const logId = logTask({
        taskId: task.id,
        prompt: task.prompt,
        result: response.content,
        modelUsed: config.id,
        tier,
        costUsd: cost.costUsd,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        qualityScore: evaluation.compositeScore,
        cacheHit: 'miss' as CacheHitType,
        evidenceConfidence: evaluation.overallEvidenceConfidence,
        coherenceConfidence: evaluation.coherence.overall,
        totalConfidence: evaluation.totalConfidence,
        durationMs: duration,
      });

      // Check verdict
      if (evaluation.verdict === 'pass') {
        console.log(`  [pass] ${config.id} — score: ${evaluation.compositeScore.toFixed(2)}, confidence: ${evaluation.totalConfidence.toFixed(2)}`);

        // Cache the successful result
        if (taskCache) {
          taskCache.store(prompt, response.content, {
            model: config.id,
            tier,
            qualityScore: evaluation.compositeScore,
            confidence: evaluation.totalConfidence,
          });
        }

        return {
          id: logId,
          taskId: task.id,
          content: response.content,
          model: config.id,
          tier,
          cost,
          evaluation,
          cached: false,
          duration,
          createdAt: new Date(),
        };
      }

      if (evaluation.verdict === 'uncertain') {
        console.log(`  [uncertain] ${config.id} — evaluator not confident (${evaluation.totalConfidence.toFixed(2)}), escalating evaluator...`);

        // Try escalating the evaluator (not the model)
        let escalationWorked = false;
        const betterEvaluator = selectModel(Math.min(tier + 1, 4) as Tier, task);
        if (betterEvaluator && await betterEvaluator.provider.isAvailable()) {
          const reEvaluation = await evaluate(response.content, contract, betterEvaluator.provider);
          if (reEvaluation.verdict === 'pass') {
            console.log(`  [pass] after evaluator escalation — score: ${reEvaluation.compositeScore.toFixed(2)}`);
            if (taskCache) {
              taskCache.store(prompt, response.content, {
                model: config.id, tier,
                qualityScore: reEvaluation.compositeScore,
                confidence: reEvaluation.totalConfidence,
              });
            }
            return {
              id: logId,
              taskId: task.id,
              content: response.content,
              model: config.id,
              tier,
              cost,
              evaluation: reEvaluation,
              cached: false,
              duration: Date.now() - startTime,
              createdAt: new Date(),
            };
          }
          escalationWorked = false; // Escalation tried but didn't pass
        }

        // Escalation unavailable or didn't help — accept if score meets threshold
        if (!escalationWorked && evaluation.compositeScore >= weightedThreshold(contract)) {
          console.log(`  [accept] ${config.id} — score meets threshold (${evaluation.compositeScore.toFixed(2)}) despite low confidence`);
          if (taskCache) {
            taskCache.store(prompt, response.content, {
              model: config.id, tier,
              qualityScore: evaluation.compositeScore,
              confidence: evaluation.totalConfidence,
            });
          }
          return {
            id: logId,
            taskId: task.id,
            content: response.content,
            model: config.id,
            tier,
            cost,
            evaluation,
            cached: false,
            duration: Date.now() - startTime,
            createdAt: new Date(),
          };
        }
      }

      console.log(`  [fail] ${config.id} — score: ${evaluation.compositeScore.toFixed(2)}, violations: ${evaluation.constitutionViolations.length}`);

    } catch (error) {
      console.log(`  [error] ${config.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // All tiers exhausted — return best effort from last attempt
  const duration = Date.now() - startTime;
  return {
    id: randomUUID(),
    taskId: task.id,
    content: '[Demiurgos] All model tiers exhausted. Could not produce an answer meeting quality standards.',
    model: 'none',
    tier: 0 as Tier,
    cost: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'none', tier: 0 as Tier },
    evaluation: emptyEvaluation(),
    cached: false,
    duration,
    createdAt: new Date(),
  };
}

// --- Task Creation ---

function createTask(prompt: string, options?: { maxBudget?: number; maxTier?: Tier; context?: string }): Task {
  return {
    id: randomUUID(),
    prompt,
    type: classifyTaskType(prompt),
    domain: classifyDomain(prompt),
    complexity: classifyComplexity(prompt),
    context: options?.context,
    maxBudget: options?.maxBudget,
    maxTier: options?.maxTier,
    createdAt: new Date(),
  };
}

// --- System Prompt Builder ---

function buildSystemPrompt(contract: import('./types.js').Contract): string {
  const rules = contract.hardRules.map(r => `- ${r.rule}`).join('\n');
  const structural = contract.structuralRules.map(r => `- ${r}`).join('\n');

  return `You are Demiurgos, a precise AI assistant. Follow these rules strictly:

HARD RULES (violation = instant rejection):
${rules}

FORMAT RULES for this ${contract.taskType} task:
${structural}

Expected format: ${contract.format}
Required elements: ${contract.requiredElements.join(', ')}

Be specific. Cite sources when available. Distinguish facts from inferences.
If you are uncertain about something, say so explicitly.`;
}

// --- Helpers ---

function emptyEvaluation(): EvaluationResult {
  return {
    scores: { accuracy: 0, completeness: 0, relevance: 0, actionability: 0, specificity: 0 },
    claimConfidences: [],
    overallEvidenceConfidence: 0,
    coherence: { chainIntegrity: 0, consistency: 0, counterArgumentResilience: 0, trackRecord: 0, overall: 0 },
    totalConfidence: 0,
    constitutionViolations: [],
    compositeScore: 0,
    verdict: 'fail',
  };
}

function perfectEvaluation(): EvaluationResult {
  return {
    scores: { accuracy: 1, completeness: 1, relevance: 1, actionability: 1, specificity: 1 },
    claimConfidences: [],
    overallEvidenceConfidence: 1,
    coherence: { chainIntegrity: 1, consistency: 1, counterArgumentResilience: 1, trackRecord: 1, overall: 1 },
    totalConfidence: 1,
    constitutionViolations: [],
    compositeScore: 1,
    verdict: 'pass',
  };
}
