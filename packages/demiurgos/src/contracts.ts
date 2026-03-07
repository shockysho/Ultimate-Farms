// ============================================================
// DEMIURGOS — Contract System (THE HEART)
// ============================================================

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { randomUUID } from 'node:crypto';
import { defaultThresholds, taskTypeKeywords } from './config.js';
import type {
  Contract, Task, TaskType, TaskComplexity,
  ConstitutionRule, DimensionThresholds, Tier,
} from './types.js';

// --- Constitution Loader ---

interface ConstitutionFile {
  hard_rules: { id: string; rule: string; action: string }[];
  structural_rules: Record<string, string[]>;
  default_thresholds: Record<string, number>;
  default_weights: Record<string, number>;
  min_evaluator_confidence: number;
}

let cachedConstitution: ConstitutionFile | null = null;
let constitutionMtime = 0;

export function loadConstitution(path = 'demiurgos-constitution.yaml'): ConstitutionFile {
  try {
    const stat = require('node:fs').statSync(path);
    if (cachedConstitution && stat.mtimeMs === constitutionMtime) {
      return cachedConstitution;
    }
    const raw = readFileSync(path, 'utf-8');
    cachedConstitution = parseYaml(raw) as ConstitutionFile;
    constitutionMtime = stat.mtimeMs;
    return cachedConstitution;
  } catch {
    // Return sensible defaults if file doesn't exist
    return {
      hard_rules: [
        { id: 'no-hallucination', rule: 'Never present made-up facts', action: 'instant_fail' },
        { id: 'answer-the-question', rule: 'Must directly address what was asked', action: 'instant_fail' },
      ],
      structural_rules: {},
      default_thresholds: {
        accuracy: 0.7, completeness: 0.6, relevance: 0.7,
        actionability: 0.5, specificity: 0.6,
      },
      default_weights: {
        accuracy: 0.25, completeness: 0.20, relevance: 0.20,
        actionability: 0.20, specificity: 0.15,
      },
      min_evaluator_confidence: 0.7,
    };
  }
}

// --- Task Classification ---

export function classifyTaskType(prompt: string): TaskType {
  const lower = prompt.toLowerCase();
  const scores: Record<TaskType, number> = {
    question: 0, code: 0, analysis: 0, decision: 0, creative: 0,
  };

  for (const [type, keywords] of Object.entries(taskTypeKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[type as TaskType]++;
      }
    }
  }

  // Default to 'question' if no strong signal
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return (best[1] > 0 ? best[0] : 'question') as TaskType;
}

export function classifyComplexity(prompt: string): TaskComplexity {
  const wordCount = prompt.split(/\s+/).length;
  const hasMultipleParts = prompt.includes(' and ') || prompt.includes('\n') || prompt.includes(';');
  const hasConditional = /\bif\b|\bwhen\b|\bassuming\b|\bgiven\b/i.test(prompt);

  if (wordCount < 15 && !hasMultipleParts) return 'simple';
  if (wordCount < 50 && !hasConditional) return 'moderate';
  if (wordCount < 150) return 'complex';
  return 'novel';
}

export function classifyDomain(prompt: string): string {
  const lower = prompt.toLowerCase();
  const domainKeywords: Record<string, string[]> = {
    farming: ['farm', 'poultry', 'chicken', 'egg', 'feed', 'flock', 'bird', 'layer', 'broiler', 'hatchery', 'biosecurity', 'mortality', 'lay rate'],
    finance: ['cost', 'price', 'budget', 'revenue', 'profit', 'expense', 'investment', 'roi', 'payment', 'cash', 'momo'],
    engineering: ['pump', 'motor', 'pipe', 'electrical', 'plumbing', 'hvac', 'cooling', 'ventilation', 'infrastructure'],
    code: ['code', 'function', 'api', 'database', 'typescript', 'react', 'node', 'sql', 'git'],
    management: ['staff', 'team', 'schedule', 'compliance', 'audit', 'process', 'workflow', 'sop'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return domain;
    }
  }
  return 'general';
}

// --- Contract Generation ---

export function generateContract(task: Task): Contract {
  const constitution = loadConstitution();

  const hardRules: ConstitutionRule[] = constitution.hard_rules.map(r => ({
    id: r.id,
    rule: r.rule,
    action: 'instant_fail' as const,
  }));

  const structuralRules = constitution.structural_rules[task.type] ?? [];

  // Load thresholds — from learned preferences if available, else defaults
  const ct = constitution.default_thresholds;
  const cw = constitution.default_weights;
  const thresholds: DimensionThresholds = {
    accuracy: ct.accuracy ?? defaultThresholds.accuracy,
    completeness: ct.completeness ?? defaultThresholds.completeness,
    relevance: ct.relevance ?? defaultThresholds.relevance,
    actionability: ct.actionability ?? defaultThresholds.actionability,
    specificity: ct.specificity ?? defaultThresholds.specificity,
    weights: [
      cw.accuracy ?? 0.25,
      cw.completeness ?? 0.20,
      cw.relevance ?? 0.20,
      cw.actionability ?? 0.20,
      cw.specificity ?? 0.15,
    ],
  };

  // Determine required elements based on task type
  const requiredElements = getRequiredElements(task.type);
  const format = getExpectedFormat(task.type);

  return {
    id: randomUUID(),
    taskId: task.id,
    generatedAt: new Date(),
    taskType: task.type,
    domain: task.domain,
    complexity: task.complexity,
    hardRules,
    structuralRules,
    thresholds,
    minEvaluatorConfidence: constitution.min_evaluator_confidence ?? 0.7,
    maxCost: task.maxBudget ?? 1.0,
    maxEscalationTier: (task.maxTier ?? 4) as Tier,
    requiredElements,
    format,
  };
}

function getRequiredElements(taskType: TaskType): string[] {
  switch (taskType) {
    case 'question': return ['direct_answer'];
    case 'code': return ['code_block', 'explanation'];
    case 'analysis': return ['findings', 'evidence'];
    case 'decision': return ['options', 'trade_offs', 'recommendation'];
    case 'creative': return ['concrete_examples'];
  }
}

function getExpectedFormat(taskType: TaskType): string {
  switch (taskType) {
    case 'question': return 'Direct answer first, then supporting details';
    case 'code': return 'Code block with comments, followed by explanation';
    case 'analysis': return 'Summary, then detailed findings with evidence';
    case 'decision': return 'Options with trade-offs, then clear recommendation';
    case 'creative': return 'Core idea, then concrete examples and applications';
  }
}
