// ============================================================
// DEMIURGOS — Orchestration Engine (The Core Loop)
// ============================================================

import { randomUUID } from 'node:crypto';
import { classifyTaskType, classifyComplexity, classifyDomain, generateContract } from './contracts.js';
import { evaluate } from './evaluator.js';
import { selectModel, getTiersToTry, tierName } from './router.js';
import { logTask } from './logger.js';
import type { Task, Result, CostRecord, Tier, EvaluationResult, CacheHitType } from './types.js';

// --- Main Execution ---

export async function execute(prompt: string, options?: {
  maxBudget?: number;
  maxTier?: Tier;
  context?: string;
}): Promise<Result> {
  const startTime = Date.now();

  // Step 1: Create task object with classification
  const task = createTask(prompt, options);

  // Step 2: Check cache (TODO: integrate ChromaDB in Stage 2)
  // const cached = await cache.search(prompt);
  // if (cached) return cached;

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
      // Use cheapest available model as evaluator (or self-evaluate for Tier 1)
      const evaluatorSelection = selectModel(Math.max(tier, 1) as Tier, task);
      const evaluatorProvider = evaluatorSelection?.provider ?? provider;
      const evaluation = await evaluate(response.content, contract, evaluatorProvider);

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
        const betterEvaluator = selectModel(Math.min(tier + 1, 4) as Tier, task);
        if (betterEvaluator) {
          const reEvaluation = await evaluate(response.content, contract, betterEvaluator.provider);
          if (reEvaluation.verdict === 'pass') {
            console.log(`  [pass] after evaluator escalation — score: ${reEvaluation.compositeScore.toFixed(2)}`);
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
