// ============================================================
// DEMIURGOS — Task Cache (Semantic Q&A Caching)
// ============================================================
//
// Stores task prompts + results in the vector store.
// On new tasks, checks for similar previous tasks:
//   - Exact match (>0.92): return cached result directly (FREE)
//   - Close match (>0.85): adapt cached result (nearly free)
//   - Miss (<0.85): no cache hit

import { VectorStore, type SearchResult } from './vector-store.js';
import { env } from '../config.js';
import type { CacheHitType } from '../types.js';

export interface CacheLookupResult {
  type: CacheHitType;
  cachedResult?: string;
  cachedPrompt?: string;
  similarity: number;
  entryId?: string;
}

export class TaskCache {
  private vectorStore: VectorStore;
  private exactThreshold: number;
  private adaptThreshold: number;

  constructor(dbPath = 'demiurgos-vectors.db') {
    this.vectorStore = new VectorStore(dbPath, 'task-cache');
    this.exactThreshold = env.cacheExactThreshold;
    this.adaptThreshold = env.cacheAdaptThreshold;
  }

  /**
   * Look up a task prompt in the cache.
   */
  lookup(prompt: string): CacheLookupResult {
    if (this.vectorStore.size() === 0) {
      return { type: 'miss', similarity: 0 };
    }

    const results = this.vectorStore.search(prompt, 1, this.adaptThreshold);

    if (results.length === 0) {
      return { type: 'miss', similarity: 0 };
    }

    const best = results[0];

    if (best.similarity >= this.exactThreshold) {
      return {
        type: 'exact',
        cachedResult: best.entry.metadata.result as string,
        cachedPrompt: best.entry.text,
        similarity: best.similarity,
        entryId: best.entry.id,
      };
    }

    if (best.similarity >= this.adaptThreshold) {
      return {
        type: 'adapt',
        cachedResult: best.entry.metadata.result as string,
        cachedPrompt: best.entry.text,
        similarity: best.similarity,
        entryId: best.entry.id,
      };
    }

    return { type: 'miss', similarity: best.similarity };
  }

  /**
   * Store a task prompt + result in the cache.
   */
  store(prompt: string, result: string, metadata: Record<string, string | number | boolean> = {}): string {
    return this.vectorStore.add(prompt, {
      ...metadata,
      result,
      cachedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark a cached entry as user-approved (higher trust for future matches).
   */
  approve(entryId: string): void {
    // In a full implementation, this would update metadata.
    // For now, keeping the entry in cache IS approval.
  }

  /**
   * Remove a cached entry (user rejected it).
   */
  reject(entryId: string): void {
    this.vectorStore.delete(entryId);
  }

  /**
   * Purge entries older than maxAge.
   */
  purgeExpired(maxAgeMs: number): number {
    return this.vectorStore.purgeExpired(maxAgeMs);
  }

  /**
   * Get cache statistics.
   */
  stats(): { totalEntries: number } {
    return {
      totalEntries: this.vectorStore.size(),
    };
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.vectorStore.clear();
  }
}
