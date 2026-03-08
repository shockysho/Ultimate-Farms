// ============================================================
// DEMIURGOS — DMN Wanderer
// ============================================================
//
// Phase 1 of the Default Mode Network.
// Reads random content from diverse sources.
// Not targeted. Not useful. Just... interesting.

import { VectorStore } from '../cache/vector-store.js';

export interface WanderingEntry {
  text: string;
  source: string;
  domain: string;
  fetchedAt: Date;
}

let wanderingStore: VectorStore | null = null;

export function initWanderingStore(dbPath = 'demiurgos-wandering.db'): VectorStore {
  wanderingStore = new VectorStore(dbPath, 'wandering');
  return wanderingStore;
}

export function getWanderingStore(): VectorStore | null {
  return wanderingStore;
}

/**
 * Wander: fetch random content from a URL and store it.
 * The wanderer doesn't care about relevance — it reads widely.
 */
export async function wander(url: string, domain: string): Promise<WanderingEntry | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Demiurgos/0.1 (Knowledge Wanderer)' },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const text = htmlToText(html);

    if (text.length < 50) return null; // Too short to be useful

    // Truncate very long pages
    const truncated = text.slice(0, 5000);

    // Store in wandering collection
    if (wanderingStore) {
      wanderingStore.add(truncated, {
        source: url,
        domain,
        fetchedAt: new Date().toISOString(),
      });
    }

    return {
      text: truncated,
      source: url,
      domain,
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Ingest raw text as wandering material (for testing or manual input).
 */
export function wanderText(text: string, source: string, domain: string): WanderingEntry {
  if (wanderingStore) {
    wanderingStore.add(text, {
      source,
      domain,
      fetchedAt: new Date().toISOString(),
    });
  }

  return { text, source, domain, fetchedAt: new Date() };
}

// --- Helpers ---

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  return text;
}
