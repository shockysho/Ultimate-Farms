// ============================================================
// DEMIURGOS — Wikipedia Source Ingestor
// ============================================================
//
// Fetches and ingests Wikipedia articles into the knowledge base.
// Uses the Wikipedia REST API for summaries and MediaWiki API
// for full article text.

import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

const WIKIPEDIA_REST = 'https://en.wikipedia.org/api/rest_v1';
const MEDIAWIKI_API = 'https://en.wikipedia.org/w/api.php';

/**
 * Ingest a Wikipedia article by title.
 *
 * Fetches both the summary and full wikitext, strips markup,
 * and ingests into the knowledge base with authority 0.7.
 */
export async function ingestWikipediaArticle(
  title: string,
  domain: string,
): Promise<IngestResult> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));

  // Try full article text first, fall back to summary
  let articleText = await fetchFullArticle(encodedTitle);

  if (!articleText) {
    articleText = await fetchSummary(encodedTitle);
  }

  if (!articleText || articleText.trim().length === 0) {
    throw new Error(`Could not fetch Wikipedia article: "${title}"`);
  }

  const sourceLabel = `wikipedia:${title} — https://en.wikipedia.org/wiki/${encodedTitle}`;

  return ingestText(articleText, sourceLabel, domain, {
    chunkSize: 500,
    overlap: 100,
  });
}

/**
 * Search Wikipedia for articles matching a query.
 * Returns a list of matching article titles.
 */
export async function searchWikipedia(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: '10',
    namespace: '0',
    format: 'json',
  });

  const response = await fetch(`${MEDIAWIKI_API}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Wikipedia search failed: ${response.status}`);
  }

  // OpenSearch returns [query, titles[], descriptions[], urls[]]
  const data = await response.json() as [string, string[], string[], string[]];
  return data[1] ?? [];
}

// --- Fetch Helpers ---

async function fetchSummary(encodedTitle: string): Promise<string | null> {
  try {
    const response = await fetch(`${WIKIPEDIA_REST}/page/summary/${encodedTitle}`);
    if (!response.ok) return null;

    const data = await response.json() as { title: string; extract: string };
    return data.extract ?? null;
  } catch {
    return null;
  }
}

async function fetchFullArticle(encodedTitle: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: decodeURIComponent(encodedTitle),
      prop: 'wikitext',
      format: 'json',
    });

    const response = await fetch(`${MEDIAWIKI_API}?${params.toString()}`);
    if (!response.ok) return null;

    const data = await response.json() as {
      parse?: { wikitext?: { '*': string } };
    };

    const wikitext = data.parse?.wikitext?.['*'];
    if (!wikitext) return null;

    return stripWikiMarkup(wikitext);
  } catch {
    return null;
  }
}

/**
 * Strip wiki markup to produce clean plain text.
 *
 * Handles: [[links]], {{templates}}, === headings ===,
 * HTML tags, references, tables, and misc formatting.
 */
function stripWikiMarkup(wikitext: string): string {
  let text = wikitext;

  // Remove references: <ref>...</ref> and <ref ... />
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove templates: {{...}} (handle nested up to 3 levels)
  for (let i = 0; i < 3; i++) {
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
  }

  // Remove tables: {|...|}
  text = text.replace(/\{\|[\s\S]*?\|\}/g, '');

  // Remove categories: [[Category:...]]
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, '');

  // Remove file/image links: [[File:...]] [[Image:...]]
  text = text.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');

  // Convert internal links: [[link|display]] → display, [[link]] → link
  text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]*)\]\]/g, '$1');

  // Remove external links: [url display] → display
  text = text.replace(/\[https?:\/\/[^\s\]]+ ([^\]]*)\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\]]*\]/g, '');

  // Convert headings: == Title == → Title
  text = text.replace(/={2,6}\s*([^=]+?)\s*={2,6}/g, '\n\n$1\n\n');

  // Remove bold/italic markup
  text = text.replace(/'{2,5}/g, '');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Remove magic words and behavior switches
  text = text.replace(/__[A-Z]+__/g, '');

  // Clean up bullet/numbered lists: * item → item
  text = text.replace(/^\*+\s*/gm, '');
  text = text.replace(/^#+\s*/gm, '');
  text = text.replace(/^;+\s*/gm, '');
  text = text.replace(/^:+\s*/gm, '');

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}
