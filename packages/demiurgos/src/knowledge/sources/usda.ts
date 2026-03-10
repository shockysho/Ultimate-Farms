// ============================================================
// DEMIURGOS — USDA Source Ingestor
// ============================================================
//
// Fetches and ingests USDA documents into the knowledge base.
// Supports HTML pages and PDF documents.
// Tagged with high authority (0.95) for official government sources.

import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

/**
 * Ingest a USDA document from a URL.
 *
 * Detects content type (HTML vs PDF) and delegates accordingly.
 * All USDA content is tagged with authority: 0.95.
 */
export async function ingestUSDADocument(
  url: string,
  domain: string,
): Promise<IngestResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch USDA document ${url}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/pdf')) {
    return ingestUSDA_PDF(url, domain);
  }

  // Default: treat as HTML
  const html = await response.text();
  const text = htmlToText(html);

  if (!text || text.trim().length === 0) {
    throw new Error(`No text content extracted from USDA document: ${url}`);
  }

  const sourceLabel = `usda:${url}`;
  return ingestText(text, sourceLabel, domain, {
    chunkSize: 500,
    overlap: 100,
  });
}

/**
 * Handle USDA PDF documents.
 *
 * Downloads the PDF and delegates to the PDF ingestor.
 * Note: Actual PDF text extraction requires a library like pdf-parse.
 * This provides the pipeline; the PDF source handles extraction.
 */
async function ingestUSDA_PDF(
  url: string,
  domain: string,
): Promise<IngestResult> {
  // For PDFs, we attempt to fetch and extract text.
  // In practice, many USDA PDFs are text-based and extractable.
  // This uses the same approach as pdf.ts — fetch content and treat as text.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch USDA PDF ${url}: ${response.status}`);
  }

  // Try to extract text from the PDF response
  // Many USDA PDFs have text layers; for scanned PDFs this will be limited
  const buffer = await response.arrayBuffer();
  const text = extractTextFromPDFBuffer(buffer);

  if (!text || text.trim().length === 0) {
    throw new Error(
      `Could not extract text from USDA PDF: ${url}. ` +
      `The document may be a scanned image PDF.`,
    );
  }

  const sourceLabel = `usda-pdf:${url}`;
  return ingestText(text, sourceLabel, domain, {
    chunkSize: 500,
    overlap: 100,
  });
}

/**
 * Basic text extraction from a PDF buffer.
 *
 * Looks for text streams in the PDF binary format.
 * This is a best-effort approach; for production use,
 * integrate a proper PDF library like pdf-parse.
 */
function extractTextFromPDFBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // Extract text between BT (Begin Text) and ET (End Text) operators
  const textParts: string[] = [];
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;

  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract parenthesized text strings: (text here)
    const tjRegex = /\(([^)]*)\)/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const text = tjMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\([()])/g, '$1');

      if (text.trim().length > 0) {
        textParts.push(text);
      }
    }
  }

  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Curated list of USDA poultry production guide URLs.
 *
 * These are high-authority sources covering:
 * - Poultry housing and management
 * - Feed and nutrition
 * - Health and biosecurity
 * - Egg production
 * - Organic standards
 */
export function getUSDAPoultryResources(): string[] {
  return [
    'https://www.nal.usda.gov/animal-production/poultry-production',
    'https://www.aphis.usda.gov/aphis/ourfocus/animalhealth/animal-disease-information/poultry',
    'https://www.ers.usda.gov/topics/animal-products/poultry-eggs/',
    'https://nifa.usda.gov/topic/poultry',
    'https://www.ams.usda.gov/rules-regulations/organic/labeling/poultry',
    'https://www.aphis.usda.gov/aphis/ourfocus/animalhealth/sa_epidemiology_and_animal_health/sa_avian_health_plan',
    'https://www.nrcs.usda.gov/conservation-basics/conservation-by-state/poultry-litter-management',
    'https://www.ers.usda.gov/webdocs/publications/poultry-yearbook/',
    'https://www.fsis.usda.gov/guidelines/poultry-processing',
    'https://attra.ncat.org/publication/poultry-house-management/',
  ];
}

// --- HTML Helpers ---

/**
 * Basic HTML to text conversion.
 * Mirrors the approach from web.ts.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script and style blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

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
