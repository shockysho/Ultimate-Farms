// ============================================================
// DEMIURGOS — Knowledge Ingestor
// ============================================================
//
// Ingests text content into the knowledge vector store.
// Handles chunking, embedding, and metadata tagging.

import { VectorStore } from '../cache/vector-store.js';
import { chunkText, type ChunkerOptions } from './chunker.js';

export interface IngestResult {
  source: string;
  domain: string;
  chunksAdded: number;
  totalCharacters: number;
}

let knowledgeStore: VectorStore | null = null;

export function initKnowledgeStore(dbPath = 'demiurgos-knowledge.db'): VectorStore {
  knowledgeStore = new VectorStore(dbPath, 'knowledge');
  return knowledgeStore;
}

export function getKnowledgeStore(): VectorStore | null {
  return knowledgeStore;
}

/**
 * Ingest raw text into the knowledge base.
 */
export function ingestText(
  text: string,
  source: string,
  domain: string,
  options?: ChunkerOptions,
): IngestResult {
  if (!knowledgeStore) {
    throw new Error('Knowledge store not initialized. Call initKnowledgeStore() first.');
  }

  const chunks = chunkText(text, options);

  for (const chunk of chunks) {
    knowledgeStore.add(chunk.text, {
      source,
      domain,
      chunkIndex: chunk.index,
      ingestedAt: new Date().toISOString(),
    });
  }

  return {
    source,
    domain,
    chunksAdded: chunks.length,
    totalCharacters: text.length,
  };
}

/**
 * Search the knowledge base for relevant content.
 */
export function searchKnowledge(query: string, topK = 5, minSimilarity = 0.3): {
  text: string;
  source: string;
  domain: string;
  similarity: number;
}[] {
  if (!knowledgeStore) return [];

  const results = knowledgeStore.search(query, topK, minSimilarity);

  return results.map(r => ({
    text: r.entry.text,
    source: r.entry.metadata.source as string,
    domain: r.entry.metadata.domain as string,
    similarity: r.similarity,
  }));
}

/**
 * Get knowledge base statistics.
 */
export function knowledgeStats(): {
  totalChunks: number;
} {
  return {
    totalChunks: knowledgeStore?.size() ?? 0,
  };
}
