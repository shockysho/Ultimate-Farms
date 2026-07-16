// ============================================================
// DEMIURGOS — PDF Source Ingestor
// ============================================================
//
// Reads PDF files and ingests their text content.
// Uses a simple text extraction approach.

import { readFileSync } from 'node:fs';
import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

/**
 * Ingest a text file (plain text, markdown, etc.)
 * For actual PDF parsing, you'd need a library like pdf-parse.
 * This handles plain text and markdown files.
 */
export function ingestTextFile(
  filePath: string,
  domain: string,
): IngestResult {
  const content = readFileSync(filePath, 'utf-8');
  return ingestText(content, filePath, domain);
}

/**
 * Ingest raw text content with a given source label.
 */
export function ingestRawText(
  text: string,
  sourceName: string,
  domain: string,
): IngestResult {
  return ingestText(text, sourceName, domain);
}
