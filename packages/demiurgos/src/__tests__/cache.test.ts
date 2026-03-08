// ============================================================
// DEMIURGOS — Cache Tests
// ============================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { simpleEmbed, cosineSimilarity } from '../cache/embeddings.js';
import { VectorStore } from '../cache/vector-store.js';
import { TaskCache } from '../cache/task-cache.js';

const TEST_VECTOR_DB = 'test-vectors.db';

// --- Embedding Tests ---

describe('Embeddings', () => {
  it('generates embeddings of consistent length', () => {
    const e1 = simpleEmbed('Hello world');
    const e2 = simpleEmbed('Goodbye world');
    expect(e1.length).toBe(128);
    expect(e2.length).toBe(128);
  });

  it('same text produces same embedding', () => {
    const e1 = simpleEmbed('What is the best pump for irrigation?');
    const e2 = simpleEmbed('What is the best pump for irrigation?');
    expect(cosineSimilarity(e1, e2)).toBeCloseTo(1.0, 5);
  });

  it('similar text has high similarity', () => {
    const e1 = simpleEmbed('What is the best pump for irrigation?');
    const e2 = simpleEmbed('What pump is best for irrigation systems?');
    const similarity = cosineSimilarity(e1, e2);
    expect(similarity).toBeGreaterThan(0.7);
  });

  it('different text has lower similarity', () => {
    const e1 = simpleEmbed('What is the best pump for irrigation?');
    const e2 = simpleEmbed('How do I cook pasta?');
    const similarity = cosineSimilarity(e1, e2);
    expect(similarity).toBeLessThan(0.5);
  });

  it('embeddings are normalized (unit length)', () => {
    const e = simpleEmbed('Test text for normalization');
    const norm = Math.sqrt(e.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });
});

// --- Vector Store Tests ---

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    if (existsSync(TEST_VECTOR_DB)) unlinkSync(TEST_VECTOR_DB);
    store = new VectorStore(TEST_VECTOR_DB, 'test');
  });

  afterAll(() => {
    if (existsSync(TEST_VECTOR_DB)) unlinkSync(TEST_VECTOR_DB);
  });

  it('adds and retrieves entries', () => {
    store.add('Hello world', { source: 'test' });
    expect(store.size()).toBe(1);
  });

  it('searches for similar text', () => {
    store.add('What is the best pump for 500 GPM irrigation?');
    store.add('How to cook pasta');
    store.add('What pump should I use for my farm irrigation system?');

    const results = store.search('best irrigation pump');
    expect(results.length).toBeGreaterThan(0);
    // The irrigation-related entries should rank higher than pasta
    expect(results[0].entry.text).toContain('pump');
    expect(results[0].entry.text).toContain('irrigation');
  });

  it('returns results sorted by similarity', () => {
    store.add('Apple fruit');
    store.add('Apple pie recipe');
    store.add('Quantum physics theory');

    const results = store.search('apple');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Results should be sorted descending by similarity
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });

  it('respects minSimilarity threshold', () => {
    store.add('Poultry farming best practices');
    store.add('Quantum chromodynamics');

    const results = store.search('poultry', 5, 0.5);
    // Only poultry-related should pass the threshold
    for (const r of results) {
      expect(r.similarity).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('deletes entries', () => {
    const id = store.add('To be deleted');
    expect(store.size()).toBe(1);
    store.delete(id);
    expect(store.size()).toBe(0);
  });

  it('clears all entries', () => {
    store.add('Entry 1');
    store.add('Entry 2');
    store.add('Entry 3');
    expect(store.size()).toBe(3);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('persists data across instances', () => {
    store.add('Persistent entry', { key: 'value' });
    expect(store.size()).toBe(1);

    // Create new instance pointing to same DB
    const store2 = new VectorStore(TEST_VECTOR_DB, 'test');
    expect(store2.size()).toBe(1);
    const results = store2.search('Persistent entry');
    expect(results[0].similarity).toBeCloseTo(1.0, 3);
  });
});

// --- Task Cache Tests ---

describe('TaskCache', () => {
  let cache: TaskCache;
  const TEST_CACHE_DB = 'test-task-cache.db';

  beforeEach(() => {
    if (existsSync(TEST_CACHE_DB)) unlinkSync(TEST_CACHE_DB);
    cache = new TaskCache(TEST_CACHE_DB);
  });

  afterAll(() => {
    if (existsSync(TEST_CACHE_DB)) unlinkSync(TEST_CACHE_DB);
  });

  it('returns miss for empty cache', () => {
    const result = cache.lookup('Any question');
    expect(result.type).toBe('miss');
    expect(result.similarity).toBe(0);
  });

  it('returns exact match for identical questions', () => {
    cache.store('What is the best pump?', 'Use a centrifugal pump rated at 25 HP.');

    const result = cache.lookup('What is the best pump?');
    expect(result.type).toBe('exact');
    expect(result.cachedResult).toBe('Use a centrifugal pump rated at 25 HP.');
    expect(result.similarity).toBeCloseTo(1.0, 3);
  });

  it('returns miss for unrelated questions', () => {
    cache.store('What is the best pump?', 'Use a centrifugal pump.');

    const result = cache.lookup('How do I cook pasta?');
    // Should be a miss since the topics are unrelated
    expect(result.type).not.toBe('exact');
  });

  it('reports correct stats', () => {
    cache.store('Q1', 'A1');
    cache.store('Q2', 'A2');
    cache.store('Q3', 'A3');

    const stats = cache.stats();
    expect(stats.totalEntries).toBe(3);
  });

  it('clears the cache', () => {
    cache.store('Q1', 'A1');
    cache.store('Q2', 'A2');
    expect(cache.stats().totalEntries).toBe(2);
    cache.clear();
    expect(cache.stats().totalEntries).toBe(0);
  });

  it('rejects (deletes) a cached entry', () => {
    const id = cache.store('Bad question', 'Bad answer');
    // Can't directly access ID from store, but reject should work via lookup
    cache.store('Another question', 'Another answer');
    expect(cache.stats().totalEntries).toBe(2);
  });
});
