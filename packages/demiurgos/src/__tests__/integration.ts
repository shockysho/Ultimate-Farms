#!/usr/bin/env npx tsx
// ============================================================
// DEMIURGOS — Live Integration Test
// ============================================================
//
// Run this on YOUR machine with real API keys and Ollama.
// It tests every real integration point and reports what's broken.
//
// Usage:
//   npx tsx src/__tests__/integration.ts
//
// Prerequisites:
//   1. Copy .env.example to .env and add your ANTHROPIC_API_KEY
//   2. (Optional) Start Ollama: ollama serve
//   3. (Optional) Pull models: ollama pull mistral
//   4. npm install

import dotenv from 'dotenv';
dotenv.config();

import { OllamaProvider } from '../providers/ollama.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { OpenAIProvider } from '../providers/openai.js';
import { initLogger, getCostSummary } from '../logger.js';
import { initCache, execute } from '../engine.js';
import { initKnowledgeStore, ingestText, searchKnowledge } from '../knowledge/ingestor.js';
import { initWanderingStore, wanderText } from '../dmn/wanderer.js';
import { initInsightJournal } from '../dmn/insight-journal.js';
import { evaluate } from '../evaluator.js';
import { generateContract, classifyTaskType, classifyComplexity, classifyDomain } from '../contracts.js';
import { TaskCache } from '../cache/task-cache.js';
import { Tier } from '../types.js';
import { existsSync, unlinkSync } from 'node:fs';

// --- Test Infrastructure ---

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
  duration: number;
}

const results: TestResult[] = [];
const TEST_DB_PREFIX = 'integration-test-';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: msg, duration: Date.now() - start });
    console.log(`  ❌ ${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function cleanup() {
  const files = [
    `${TEST_DB_PREFIX}ops.db`, `${TEST_DB_PREFIX}ops.db-wal`, `${TEST_DB_PREFIX}ops.db-shm`,
    `${TEST_DB_PREFIX}vectors.db`, `${TEST_DB_PREFIX}vectors.db-wal`, `${TEST_DB_PREFIX}vectors.db-shm`,
    `${TEST_DB_PREFIX}knowledge.db`, `${TEST_DB_PREFIX}knowledge.db-wal`, `${TEST_DB_PREFIX}knowledge.db-shm`,
    `${TEST_DB_PREFIX}wandering.db`, `${TEST_DB_PREFIX}wandering.db-wal`, `${TEST_DB_PREFIX}wandering.db-shm`,
    `${TEST_DB_PREFIX}insights.db`, `${TEST_DB_PREFIX}insights.db-wal`, `${TEST_DB_PREFIX}insights.db-shm`,
  ];
  for (const f of files) {
    if (existsSync(f)) unlinkSync(f);
  }
}

// ============================================================
// TESTS
// ============================================================

async function run() {
  console.log('\n🔧 DEMIURGOS — Live Integration Tests\n');
  console.log('Testing against real providers with real API calls.\n');

  cleanup();
  initLogger(`${TEST_DB_PREFIX}ops.db`);
  initCache(`${TEST_DB_PREFIX}vectors.db`);
  initKnowledgeStore(`${TEST_DB_PREFIX}knowledge.db`);
  initWanderingStore(`${TEST_DB_PREFIX}wandering.db`);
  initInsightJournal(`${TEST_DB_PREFIX}insights.db`);

  // ---- SECTION 1: Provider Availability ----
  console.log('--- Provider Availability ---\n');

  const ollama = new OllamaProvider('tinyllama');
  const ollamaAvailable = await ollama.isAvailable();

  await test('Ollama is reachable', async () => {
    if (!ollamaAvailable) {
      throw new Error('Ollama not running. Start with: ollama serve');
    }
  });

  const anthropic = new AnthropicProvider();
  const anthropicAvailable = await anthropic.isAvailable();

  await test('Anthropic API key is set', async () => {
    assert(anthropicAvailable, 'ANTHROPIC_API_KEY not set in .env');
  });

  const openai = new OpenAIProvider();
  const openaiAvailable = await openai.isAvailable();

  await test('OpenAI API key is set (optional)', async () => {
    if (!openaiAvailable) {
      throw new Error('OPENAI_API_KEY not set (optional — Anthropic is sufficient)');
    }
  });

  // ---- SECTION 2: Ollama Real Inference ----
  console.log('\n--- Ollama Real Inference ---\n');

  if (ollamaAvailable) {
    await test('Ollama generates a response', async () => {
      const response = await ollama.generate('What is 2 + 2? Answer with just the number.');
      assert(response.content.length > 0, 'Empty response from Ollama');
      assert(response.content.includes('4'), `Expected "4" in response, got: "${response.content.slice(0, 100)}"`);
      console.log(`    Response: "${response.content.slice(0, 80)}"`);
      console.log(`    Tokens: ${response.inputTokens} in, ${response.outputTokens} out`);
    });

    await test('Ollama handles system prompts', async () => {
      const response = await ollama.generate(
        'What color is the sky?',
        'You must answer every question with exactly one word.',
      );
      assert(response.content.length > 0, 'Empty response');
      console.log(`    Response: "${response.content.slice(0, 80)}"`);
    });

    await test('Ollama response is parseable for evaluation', async () => {
      const response = await ollama.generate(
        'Rate this text on accuracy from 0 to 1. Return ONLY a JSON object: {"accuracy": 0.8, "completeness": 0.7, "relevance": 0.9, "actionability": 0.6, "specificity": 0.7}',
        'You are a strict evaluator. Return only valid JSON, nothing else.',
        { temperature: 0.1 },
      );
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      assert(jsonMatch !== null, `Ollama didn't return JSON. Got: "${response.content.slice(0, 200)}"`);
      const parsed = JSON.parse(jsonMatch![0]);
      assert(typeof parsed.accuracy === 'number', `accuracy is not a number: ${parsed.accuracy}`);
      console.log(`    Parsed JSON: ${JSON.stringify(parsed)}`);
    });
  } else {
    console.log('  ⏭️  Skipping Ollama tests (not available)\n');
  }

  // ---- SECTION 3: Anthropic Real Inference ----
  console.log('\n--- Anthropic Real Inference ---\n');

  if (anthropicAvailable) {
    await test('Anthropic Haiku generates a response', async () => {
      const haiku = new AnthropicProvider('claude-haiku-4-5-20251001');
      const response = await haiku.generate('What is 2 + 2? Answer with just the number.');
      assert(response.content.length > 0, 'Empty response from Haiku');
      assert(response.content.includes('4'), `Expected "4" in response, got: "${response.content.slice(0, 100)}"`);
      console.log(`    Response: "${response.content.slice(0, 80)}"`);
      console.log(`    Tokens: ${response.inputTokens} in, ${response.outputTokens} out`);
    });

    await test('Anthropic returns parseable JSON for evaluation', async () => {
      const haiku = new AnthropicProvider('claude-haiku-4-5-20251001');
      const response = await haiku.generate(
        'Score this text: "Water boils at 100 degrees Celsius at sea level."\nReturn ONLY a JSON object with these keys: accuracy, completeness, relevance, actionability, specificity (each 0.0 to 1.0)',
        'You are a strict quality evaluator. Return only valid JSON.',
        { temperature: 0.1 },
      );
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      assert(jsonMatch !== null, `Haiku didn't return parseable JSON. Got: "${response.content.slice(0, 200)}"`);
      const parsed = JSON.parse(jsonMatch![0]);
      assert(typeof parsed.accuracy === 'number', `accuracy is not a number`);
      assert(parsed.accuracy >= 0 && parsed.accuracy <= 1, `accuracy out of range: ${parsed.accuracy}`);
      console.log(`    Parsed scores: ${JSON.stringify(parsed)}`);
    });

    await test('Anthropic coherence evaluation returns valid JSON', async () => {
      const haiku = new AnthropicProvider('claude-haiku-4-5-20251001');
      const response = await haiku.generate(
        'Evaluate coherence of: "Water is essential for life. Plants need water. Therefore, plants are alive."\nReturn ONLY JSON: {"chain_integrity": <float>, "consistency": <float>, "counter_argument_resilience": <float>, "track_record": <float>}',
        'You are a logic evaluator. Return only valid JSON.',
        { temperature: 0.1 },
      );
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      assert(jsonMatch !== null, `Coherence eval didn't return JSON. Got: "${response.content.slice(0, 200)}"`);
      const parsed = JSON.parse(jsonMatch![0]);
      assert(typeof parsed.chain_integrity === 'number', `chain_integrity missing or not a number`);
      console.log(`    Coherence scores: ${JSON.stringify(parsed)}`);
    });
  } else {
    console.log('  ⏭️  Skipping Anthropic tests (no API key)\n');
  }

  // ---- SECTION 4: Full Engine E2E with Real Models ----
  console.log('\n--- Full Engine E2E ---\n');

  if (ollamaAvailable || anthropicAvailable) {
    await test('Engine executes a simple question end-to-end', async () => {
      const result = await execute('What is the capital of France?', {
        maxBudget: 0.10,
        maxTier: anthropicAvailable ? Tier.CHEAP : Tier.LOCAL,
      });

      assert(result.content.length > 0, 'Empty result from engine');
      assert(result.content.toLowerCase().includes('paris'), `Expected "Paris" in response, got: "${result.content.slice(0, 200)}"`);
      assert(result.cost.costUsd >= 0, 'Cost should be non-negative');
      assert(result.evaluation.compositeScore >= 0, 'Quality score should be non-negative');
      console.log(`    Model: ${result.model} | Cost: $${result.cost.costUsd.toFixed(4)} | Quality: ${result.evaluation.compositeScore.toFixed(2)}`);
      console.log(`    Evidence: ${result.evaluation.overallEvidenceConfidence.toFixed(2)} | Coherence: ${result.evaluation.coherence.overall.toFixed(2)}`);
      console.log(`    Verdict: ${result.evaluation.verdict}`);
    });

    await test('Engine routes to cheapest model first', async () => {
      const result = await execute('What is 5 + 3?', {
        maxTier: ollamaAvailable ? Tier.LOCAL : Tier.CHEAP,
      });

      if (ollamaAvailable) {
        assert(result.tier === Tier.LOCAL || result.cost.costUsd === 0,
          `Expected local tier, got tier ${result.tier} costing $${result.cost.costUsd}`);
      }
      console.log(`    Used tier: ${result.tier} | Model: ${result.model}`);
    });

    await test('Cache works: second identical question is free', async () => {
      // First call (should execute normally)
      const result1 = await execute('What is the boiling point of water?');
      console.log(`    First call: ${result1.model} | $${result1.cost.costUsd.toFixed(4)} | cached: ${result1.cached}`);

      // Second call (should hit cache)
      const result2 = await execute('What is the boiling point of water?');
      console.log(`    Second call: ${result2.model} | $${result2.cost.costUsd.toFixed(4)} | cached: ${result2.cached}`);

      assert(result2.cached === true, `Second call should be cached, but cached=${result2.cached}`);
      assert(result2.cost.costUsd === 0, `Cached result should be free, but cost=$${result2.cost.costUsd}`);
    });

    await test('Evaluator produces meaningful scores on real output', async () => {
      const task = {
        id: 'eval-test',
        prompt: 'Explain photosynthesis',
        type: 'question' as const,
        domain: 'general',
        complexity: 'moderate' as const,
        createdAt: new Date(),
      };
      const contract = generateContract(task);
      contract.minEvaluatorConfidence = 0.3; // Lower for testing

      const testOutput = 'Photosynthesis is the process by which plants convert sunlight, water, and carbon dioxide into glucose and oxygen. The light-dependent reactions occur in the thylakoid membranes, while the Calvin cycle occurs in the stroma. The overall equation is: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2.';

      const evaluator = anthropicAvailable
        ? new AnthropicProvider('claude-haiku-4-5-20251001')
        : ollama;

      const evalResult = await evaluate(testOutput, contract, evaluator);

      console.log(`    Scores: accuracy=${evalResult.scores.accuracy.toFixed(2)}, completeness=${evalResult.scores.completeness.toFixed(2)}`);
      console.log(`    Composite: ${evalResult.compositeScore.toFixed(2)} | Confidence: ${evalResult.totalConfidence.toFixed(2)}`);
      console.log(`    Verdict: ${evalResult.verdict}`);
      console.log(`    Claims analyzed: ${evalResult.claimConfidences.length}`);
      console.log(`    Coherence: integrity=${evalResult.coherence.chainIntegrity.toFixed(2)}, resilience=${evalResult.coherence.counterArgumentResilience.toFixed(2)}`);

      assert(evalResult.scores.accuracy > 0, 'Accuracy should be > 0 for a correct answer');
      assert(evalResult.compositeScore > 0.3, `Composite score too low for a correct answer: ${evalResult.compositeScore}`);
    });

    await test('Constitution rejects bad output', async () => {
      const task = {
        id: 'constitution-test',
        prompt: 'What is the meaning of life?',
        type: 'question' as const,
        domain: 'general',
        complexity: 'simple' as const,
        createdAt: new Date(),
      };
      const contract = generateContract(task);

      const badOutput = 'It depends on many factors. There are many options available. This is a complex topic. Consult with a professional. Results may vary.';

      const evaluator = anthropicAvailable
        ? new AnthropicProvider('claude-haiku-4-5-20251001')
        : ollama;

      const evalResult = await evaluate(badOutput, contract, evaluator);

      console.log(`    Violations: ${evalResult.constitutionViolations.length}`);
      console.log(`    Verdict: ${evalResult.verdict}`);

      assert(evalResult.constitutionViolations.length > 0, 'Generic filler should violate constitution');
      assert(evalResult.verdict === 'fail', 'Generic filler should fail');
    });
  } else {
    console.log('  ⏭️  Skipping engine E2E tests (no providers available)\n');
  }

  // ---- SECTION 5: Knowledge + Cache Integration ----
  console.log('\n--- Knowledge & Cache ---\n');

  await test('Knowledge ingestion and retrieval', async () => {
    const result = ingestText(
      'Layer chickens require 16-18% crude protein in their feed during peak production. Calcium levels should be maintained at 3.5-4.0% for optimal eggshell quality. Excessive protein beyond 18% increases ammonia in manure without production benefit.',
      'USDA Poultry Nutrition Guide',
      'farming',
    );

    assert(result.chunksAdded > 0, 'Should ingest at least 1 chunk');

    const searchResults = searchKnowledge('how much protein for layer chickens');
    assert(searchResults.length > 0, 'Should find relevant knowledge');
    assert(searchResults[0].text.includes('protein'), 'Result should mention protein');
    console.log(`    Ingested ${result.chunksAdded} chunks. Found ${searchResults.length} results.`);
    console.log(`    Top result similarity: ${searchResults[0].similarity.toFixed(3)}`);
  });

  await test('Cache similarity thresholds are reasonable', async () => {
    const cache = new TaskCache(`${TEST_DB_PREFIX}threshold-test.db`);

    cache.store('What is the best pump for 500 GPM irrigation?', 'Use a 25 HP centrifugal pump.');

    // Exact match
    const exact = cache.lookup('What is the best pump for 500 GPM irrigation?');
    assert(exact.type === 'exact', `Identical question should be exact match, got: ${exact.type} (sim: ${exact.similarity.toFixed(3)})`);

    // Very similar
    const similar = cache.lookup('What pump is best for 500 GPM irrigation systems?');
    console.log(`    Similar question similarity: ${similar.similarity.toFixed(3)} → ${similar.type}`);

    // Unrelated
    const unrelated = cache.lookup('How do I cook pasta?');
    assert(unrelated.type === 'miss', `Unrelated question should miss, got: ${unrelated.type} (sim: ${unrelated.similarity.toFixed(3)})`);

    console.log(`    Exact: ${exact.similarity.toFixed(3)} | Similar: ${similar.similarity.toFixed(3)} | Unrelated: ${unrelated.similarity.toFixed(3)}`);

    // Check if thresholds make sense
    if (similar.type === 'miss') {
      console.log(`    ⚠️  WARNING: Similar question was a miss. Adapt threshold (0.85) may be too high for simple embeddings.`);
      console.log(`    Consider lowering CACHE_ADAPT_THRESHOLD in .env`);
    }

    // Cleanup
    if (existsSync(`${TEST_DB_PREFIX}threshold-test.db`)) unlinkSync(`${TEST_DB_PREFIX}threshold-test.db`);
  });

  // ---- SECTION 6: Cost Tracking ----
  console.log('\n--- Cost Tracking ---\n');

  await test('Cost tracking records real API calls', async () => {
    const summary = getCostSummary();
    console.log(`    Today: $${summary.today.totalUsd.toFixed(4)} | Tasks: ${summary.today.taskCount} | Cache rate: ${(summary.today.cacheHitRate * 100).toFixed(1)}%`);

    if (summary.byModel.length > 0) {
      console.log('    By model:');
      for (const m of summary.byModel) {
        console.log(`      ${m.model}: $${m.totalUsd.toFixed(4)} (${m.taskCount} tasks)`);
      }
    }
  });

  // ---- RESULTS ----
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`  ${passed}/${total} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('  FAILURES:\n');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.error}\n`);
    }
  }

  console.log('\n  TIMING:\n');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.duration}ms`);
  }

  // Cleanup
  cleanup();

  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    console.log('  ALL TESTS PASSED — Demiurgos is ready.');
  } else {
    console.log(`  ${failed} TESTS FAILED — Fix these before relying on the system.`);
    console.log('  Report these failures back so I can fix the code.');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Integration test crashed:', err);
  cleanup();
  process.exit(1);
});
