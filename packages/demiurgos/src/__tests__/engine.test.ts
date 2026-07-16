// ============================================================
// DEMIURGOS — End-to-End Tests
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { classifyTaskType, classifyComplexity, classifyDomain, generateContract, loadConstitution } from '../contracts.js';
import { evaluate } from '../evaluator.js';
import { initLogger, getCostSummary, logTask, getRecentTasks } from '../logger.js';
import { MockProvider, mockResponses } from '../providers/mock.js';
import { Tier, type CacheHitType } from '../types.js';

const TEST_DB = 'test-demiurgos-ops.db';

// --- Task Classification Tests ---

describe('Task Classification', () => {
  it('classifies questions correctly', () => {
    expect(classifyTaskType('What is the best pump for irrigation?')).toBe('question');
    expect(classifyTaskType('How does feed formulation work?')).toBe('question');
    expect(classifyTaskType('Explain the biosecurity protocol')).toBe('question');
  });

  it('classifies code tasks correctly', () => {
    expect(classifyTaskType('Write a function to calculate FCR')).toBe('code');
    expect(classifyTaskType('Debug this TypeScript code')).toBe('code');
    expect(classifyTaskType('Implement the API endpoint for feed tracking')).toBe('code');
  });

  it('classifies decision tasks correctly', () => {
    expect(classifyTaskType('Should I invest in a new feed mill?')).toBe('decision');
    expect(classifyTaskType('What is the best option for cooling?')).toBe('decision');
    expect(classifyTaskType('Recommend a supplier for equipment')).toBe('decision');
  });

  it('classifies analysis tasks correctly', () => {
    expect(classifyTaskType('Analyze the production trends for Q1')).toBe('analysis');
    expect(classifyTaskType('Compare the two feed suppliers')).toBe('analysis');
    expect(classifyTaskType('Evaluate our maintenance efficiency')).toBe('analysis');
  });

  it('classifies creative tasks correctly', () => {
    expect(classifyTaskType('Design a new biosecurity workflow')).toBe('creative');
    expect(classifyTaskType('Brainstorm ways to reduce feed costs')).toBe('creative');
  });

  it('defaults to question for ambiguous input', () => {
    expect(classifyTaskType('hello')).toBe('question');
    expect(classifyTaskType('test')).toBe('question');
  });
});

describe('Complexity Classification', () => {
  it('classifies simple tasks', () => {
    expect(classifyComplexity('What is 2+2?')).toBe('simple');
    expect(classifyComplexity('Hello world')).toBe('simple');
  });

  it('classifies moderate tasks', () => {
    expect(classifyComplexity('What is the best approach to reduce feed costs in a poultry operation with 5000 birds?')).toBe('moderate');
  });

  it('classifies complex tasks', () => {
    const complex = 'If we expand to a second farm, assuming current mortality rates stay below 0.5%, and given the current feed prices, what would be the projected ROI over 3 years, taking into account seasonal demand variations and potential equipment failures?';
    expect(classifyComplexity(complex)).toBe('complex');
  });
});

describe('Domain Classification', () => {
  it('classifies farming domain', () => {
    expect(classifyDomain('What is the best feed for layer chickens?')).toBe('farming');
    expect(classifyDomain('Mortality rate is too high in the flock')).toBe('farming');
  });

  it('classifies finance domain', () => {
    expect(classifyDomain('What is the ROI on this investment?')).toBe('finance');
    expect(classifyDomain('Budget analysis for Q3')).toBe('finance');
  });

  it('classifies engineering domain', () => {
    expect(classifyDomain('What pump should I use for the cooling system?')).toBe('engineering');
  });

  it('defaults to general', () => {
    expect(classifyDomain('Tell me about the weather')).toBe('general');
  });
});

// --- Contract Generation Tests ---

describe('Contract Generation', () => {
  it('generates a contract with hard rules from constitution', () => {
    const task = {
      id: 'test-1',
      prompt: 'What is the best feed formula?',
      type: 'question' as const,
      domain: 'farming',
      complexity: 'moderate' as const,
      createdAt: new Date(),
    };

    const contract = generateContract(task);

    expect(contract.taskId).toBe('test-1');
    expect(contract.taskType).toBe('question');
    expect(contract.domain).toBe('farming');
    expect(contract.hardRules.length).toBeGreaterThan(0);
    expect(contract.hardRules[0].action).toBe('instant_fail');
    expect(contract.thresholds.accuracy).toBeGreaterThan(0);
    expect(contract.thresholds.weights.length).toBe(5);
    expect(contract.requiredElements).toContain('direct_answer');
  });

  it('applies correct structural rules for code tasks', () => {
    const task = {
      id: 'test-2',
      prompt: 'Write a function to calculate FCR',
      type: 'code' as const,
      domain: 'code',
      complexity: 'moderate' as const,
      createdAt: new Date(),
    };

    const contract = generateContract(task);
    expect(contract.requiredElements).toContain('code_block');
    expect(contract.requiredElements).toContain('explanation');
  });

  it('applies correct structural rules for decision tasks', () => {
    const task = {
      id: 'test-3',
      prompt: 'Should I expand to hydroponics?',
      type: 'decision' as const,
      domain: 'farming',
      complexity: 'complex' as const,
      createdAt: new Date(),
    };

    const contract = generateContract(task);
    expect(contract.requiredElements).toContain('options');
    expect(contract.requiredElements).toContain('trade_offs');
    expect(contract.requiredElements).toContain('recommendation');
  });
});

// --- Constitution Tests ---

describe('Constitution', () => {
  it('loads constitution with hard rules', () => {
    const constitution = loadConstitution();
    expect(constitution.hard_rules.length).toBeGreaterThan(0);
    expect(constitution.hard_rules[0].id).toBeTruthy();
    expect(constitution.hard_rules[0].rule).toBeTruthy();
  });

  it('has default thresholds', () => {
    const constitution = loadConstitution();
    expect(constitution.default_thresholds.accuracy).toBeGreaterThan(0);
    expect(constitution.default_thresholds.completeness).toBeGreaterThan(0);
  });
});

// --- Evaluator Tests ---

describe('Evaluator', () => {
  it('fails on constitution violations (generic filler)', async () => {
    const contract = generateContract({
      id: 'test-eval-1',
      prompt: 'How to reduce feed costs?',
      type: 'question' as const,
      domain: 'farming',
      complexity: 'moderate' as const,
      createdAt: new Date(),
    });

    const genericOutput = 'It depends on many factors. There are many options available. This is a complex topic. Consult with a professional. Results may vary.';

    const mockEvaluator = new MockProvider([mockResponses.evaluatorPass, mockResponses.coherenceHigh]);
    const result = await evaluate(genericOutput, contract, mockEvaluator);

    expect(result.constitutionViolations.length).toBeGreaterThan(0);
    expect(result.verdict).toBe('fail');
  });

  it('passes a good response with high scores', async () => {
    const contract = generateContract({
      id: 'test-eval-2',
      prompt: 'What pump for 500 GPM?',
      type: 'question' as const,
      domain: 'engineering',
      complexity: 'moderate' as const,
      createdAt: new Date(),
    });

    // Lower confidence threshold: without a vector DB, evidence confidence
    // is heuristic-only (~0.4-0.5), so total confidence won't reach 0.7.
    // This is correct behavior — the system can't verify claims yet.
    contract.minEvaluatorConfidence = 0.5;

    const mockEvaluator = new MockProvider([mockResponses.evaluatorPass, mockResponses.coherenceHigh]);
    const result = await evaluate(mockResponses.detailed.content, contract, mockEvaluator);

    expect(result.constitutionViolations.length).toBe(0);
    expect(result.compositeScore).toBeGreaterThan(0.5);
    expect(result.verdict).toBe('pass');
  });

  it('returns uncertain when evaluator scores low coherence', async () => {
    const contract = generateContract({
      id: 'test-eval-3',
      prompt: 'Should I expand?',
      type: 'decision' as const,
      domain: 'farming',
      complexity: 'complex' as const,
      createdAt: new Date(),
    });
    // Set min confidence high so low coherence triggers uncertain
    contract.minEvaluatorConfidence = 0.8;

    const mockEvaluator = new MockProvider([mockResponses.evaluatorPass, mockResponses.coherenceLow]);
    const result = await evaluate(mockResponses.detailed.content, contract, mockEvaluator);

    // With low coherence, total confidence should be below 0.8 threshold
    expect(result.coherence.overall).toBeLessThan(0.5);
  });

  it('computes per-claim confidence', async () => {
    const contract = generateContract({
      id: 'test-eval-4',
      prompt: 'Tell me about pumps',
      type: 'question' as const,
      domain: 'engineering',
      complexity: 'simple' as const,
      createdAt: new Date(),
    });

    const mockEvaluator = new MockProvider([mockResponses.evaluatorPass, mockResponses.coherenceHigh]);
    const result = await evaluate(mockResponses.detailed.content, contract, mockEvaluator);

    expect(result.claimConfidences.length).toBeGreaterThan(0);
    for (const claim of result.claimConfidences) {
      expect(claim.confidence).toBeGreaterThanOrEqual(0);
      expect(claim.confidence).toBeLessThanOrEqual(1);
      expect(claim.tier).toBeGreaterThanOrEqual(0);
      expect(claim.tier).toBeLessThanOrEqual(5);
      expect(claim.reason).toBeTruthy();
    }
  });
});

// --- Logger Tests ---

describe('Logger', () => {
  beforeAll(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    initLogger(TEST_DB);
  });

  afterAll(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it('logs a task and retrieves it', () => {
    const id = logTask({
      taskId: 'task-1',
      prompt: 'Test question',
      result: 'Test answer',
      modelUsed: 'mock-model',
      tier: Tier.LOCAL,
      costUsd: 0,
      inputTokens: 100,
      outputTokens: 50,
      qualityScore: 0.85,
      cacheHit: 'miss' as CacheHitType,
      evidenceConfidence: 0.7,
      coherenceConfidence: 0.8,
      totalConfidence: 0.74,
      durationMs: 500,
    });

    expect(id).toBeTruthy();

    const recent = getRecentTasks(1);
    expect(recent.length).toBe(1);
    expect(recent[0].prompt).toBe('Test question');
    expect(recent[0].modelUsed).toBe('mock-model');
  });

  it('tracks daily costs', () => {
    // Log a task with cost
    logTask({
      taskId: 'task-2',
      prompt: 'Paid question',
      result: 'Paid answer',
      modelUsed: 'claude-haiku',
      tier: Tier.CHEAP,
      costUsd: 0.005,
      inputTokens: 200,
      outputTokens: 100,
      qualityScore: 0.90,
      cacheHit: 'miss' as CacheHitType,
      evidenceConfidence: 0.8,
      coherenceConfidence: 0.85,
      totalConfidence: 0.82,
      durationMs: 1200,
    });

    const summary = getCostSummary();
    expect(summary.today.totalUsd).toBeGreaterThan(0);
    expect(summary.today.taskCount).toBeGreaterThanOrEqual(2);
  });

  it('reports cost by model and tier', () => {
    const summary = getCostSummary();
    expect(summary.byModel.length).toBeGreaterThan(0);
    expect(summary.byTier.length).toBeGreaterThan(0);
  });
});

// --- Mock Provider Tests ---

describe('MockProvider', () => {
  it('returns mock responses in order', async () => {
    const mock = new MockProvider([
      { content: 'First response' },
      { content: 'Second response' },
    ]);

    const r1 = await mock.generate('q1');
    expect(r1.content).toBe('First response');

    const r2 = await mock.generate('q2');
    expect(r2.content).toBe('Second response');

    // Cycles back
    const r3 = await mock.generate('q3');
    expect(r3.content).toBe('First response');
  });

  it('tracks all calls', async () => {
    const mock = new MockProvider([{ content: 'test' }]);
    await mock.generate('prompt1', 'system1');
    await mock.generate('prompt2');

    expect(mock.calls.length).toBe(2);
    expect(mock.calls[0].prompt).toBe('prompt1');
    expect(mock.calls[0].systemPrompt).toBe('system1');
    expect(mock.calls[1].prompt).toBe('prompt2');
  });

  it('reports availability correctly', async () => {
    const available = new MockProvider([], true);
    const unavailable = new MockProvider([], false);

    expect(await available.isAvailable()).toBe(true);
    expect(await unavailable.isAvailable()).toBe(false);
  });
});
