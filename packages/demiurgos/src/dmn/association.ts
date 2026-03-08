// ============================================================
// DEMIURGOS — DMN Association Engine
// ============================================================
//
// Phase 2 of the Default Mode Network.
// Finds UNEXPECTED cross-domain connections in the vector space.
// This IS analogical reasoning — structural similarity across
// domains that no one would think to connect.

import { VectorStore, type SearchResult } from '../cache/vector-store.js';

export interface CrossDomainLink {
  entryA: { text: string; domain: string; source: string };
  entryB: { text: string; domain: string; source: string };
  similarity: number;
  surprising: boolean; // Different domains but high similarity = surprising
}

/**
 * Find cross-domain associations between wandering entries
 * and the main knowledge base.
 */
export function findAssociations(
  wanderingStore: VectorStore,
  knowledgeStore: VectorStore,
  minSimilarity = 0.4,
  maxResults = 10,
): CrossDomainLink[] {
  const links: CrossDomainLink[] = [];

  // Get recent wandering entries
  const wanderingResults = wanderingStore.search('', 50, 0); // Get all
  // We need to iterate through wandering entries and find matches in knowledge

  // Since we can't iterate the store directly, we use a broad search
  // In practice, we'd iterate the SQLite table directly
  // For now, use the search with various seed queries
  const seeds = extractSeeds(wanderingStore);

  for (const seed of seeds) {
    // Search knowledge base for similar content
    const knowledgeMatches = knowledgeStore.search(seed.text, 3, minSimilarity);

    for (const match of knowledgeMatches) {
      const seedDomain = seed.domain;
      const matchDomain = match.entry.metadata.domain as string;

      // Only interesting if domains are DIFFERENT (cross-domain)
      const surprising = seedDomain !== matchDomain;

      if (surprising || match.similarity > 0.7) {
        links.push({
          entryA: { text: seed.text.slice(0, 200), domain: seedDomain, source: seed.source },
          entryB: { text: match.entry.text.slice(0, 200), domain: matchDomain, source: match.entry.metadata.source as string },
          similarity: match.similarity,
          surprising,
        });
      }
    }
  }

  // Sort by surprise factor: different domains + high similarity = most interesting
  return links
    .sort((a, b) => {
      const scoreA = a.similarity * (a.surprising ? 2 : 1);
      const scoreB = b.similarity * (b.surprising ? 2 : 1);
      return scoreB - scoreA;
    })
    .slice(0, maxResults);
}

// --- Helpers ---

interface SeedEntry {
  text: string;
  domain: string;
  source: string;
}

function extractSeeds(store: VectorStore): SeedEntry[] {
  // Use broad queries to get diverse entries from the wandering store
  const broadQueries = [
    'system design pattern',
    'efficiency optimization',
    'management process',
    'technology innovation',
    'natural biological process',
    'economics market',
    'engineering solution',
    'human behavior psychology',
  ];

  const seeds: SeedEntry[] = [];
  const seen = new Set<string>();

  for (const query of broadQueries) {
    const results = store.search(query, 3, 0.1);
    for (const r of results) {
      if (!seen.has(r.entry.id)) {
        seen.add(r.entry.id);
        seeds.push({
          text: r.entry.text,
          domain: r.entry.metadata.domain as string,
          source: r.entry.metadata.source as string,
        });
      }
    }
  }

  return seeds;
}
