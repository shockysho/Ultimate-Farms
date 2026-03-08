// ============================================================
// DEMIURGOS — Web Source Ingestor
// ============================================================
//
// Fetches and ingests content from web pages.

import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

/**
 * Fetch a web page and ingest its text content.
 */
export async function ingestWebPage(
  url: string,
  domain: string,
): Promise<IngestResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();

  // Basic HTML to text conversion
  const text = htmlToText(html);

  return ingestText(text, url, domain);
}

/**
 * Basic HTML to text conversion. Strips tags, decodes entities,
 * preserves paragraph structure.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script and style blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode basic HTML entities
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
