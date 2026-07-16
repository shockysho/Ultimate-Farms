// ============================================================
// DEMIURGOS — Claim Decomposer
// ============================================================
//
// Breaks LLM output into individual factual claims for
// evidence-grounded confidence scoring. Uses regex + heuristics
// (no LLM needed for decomposition).

import type { Claim } from '../types.js';

// --- Keyword patterns for claim type detection ---

const RECOMMENDATION_PATTERNS = [
  /\bshould\b/i,
  /\brecommend/i,
  /\bsuggest/i,
  /\bconsider\b/i,
  /\bbest practice/i,
  /\bideal(?:ly)?\b/i,
  /\badvise/i,
  /\bpreferable/i,
  /\bopt for\b/i,
];

const INFERENCE_PATTERNS = [
  /\btherefore\b/i,
  /\bthus\b/i,
  /\bhence\b/i,
  /\bimplies\b/i,
  /\bsuggests that\b/i,
  /\bindicates that\b/i,
  /\bconsequently\b/i,
  /\bas a result\b/i,
  /\bwe can (?:conclude|infer)\b/i,
  /\bthis means\b/i,
  /\bit follows that\b/i,
  /\bbased on this\b/i,
];

const OPINION_PATTERNS = [
  /\bi think\b/i,
  /\bi believe\b/i,
  /\bin my (?:opinion|view)\b/i,
  /\bprobably\b/i,
  /\bmight\b/i,
  /\bcould be\b/i,
  /\bperhaps\b/i,
  /\bseems?\b/i,
  /\bappears? to\b/i,
  /\bargua?bly\b/i,
  /\blikely\b/i,
  /\bpossibly\b/i,
];

// Minimum characters for a claim to be meaningful
const MIN_CLAIM_LENGTH = 15;

// Maximum claims to extract (performance bound)
const MAX_CLAIMS = 20;

/**
 * Decompose LLM output into individual claims.
 *
 * Uses sentence splitting + keyword detection to classify each
 * sentence as factual, recommendation, inference, or opinion.
 */
export function decomposeClaims(output: string): Claim[] {
  const sentences = splitIntoSentences(output);
  const claims: Claim[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    // Skip trivially short fragments
    if (trimmed.length < MIN_CLAIM_LENGTH) continue;

    // Skip headings, list markers without substance, code blocks
    if (isNonAssertive(trimmed)) continue;

    const type = classifyClaimType(trimmed);
    claims.push({ text: trimmed, type });

    if (claims.length >= MAX_CLAIMS) break;
  }

  return claims;
}

// --- Internal helpers ---

/**
 * Split text into sentences. Handles common abbreviations and
 * preserves sentence boundaries at `.`, `!`, `?`.
 */
function splitIntoSentences(text: string): string[] {
  // Remove code blocks — they are not claims
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  // Split on sentence-ending punctuation, but not on common abbreviations
  // like "e.g.", "i.e.", "Dr.", "Mr.", "vs.", decimal numbers
  const protected_ = withoutCode
    .replace(/\b(e\.g|i\.e|vs|etc|Dr|Mr|Ms|Mrs|Prof|Jr|Sr|Inc|Ltd|Corp)\./gi, '$1\x00')
    .replace(/(\d)\./g, '$1\x00');

  const raw = protected_.split(/[.!?]+/);

  return raw
    .map(s => s.replace(/\x00/g, '.').trim())
    .filter(s => s.length > 0);
}

/**
 * Check if a sentence is non-assertive (headings, bullets without
 * substance, questions, etc.).
 */
function isNonAssertive(text: string): boolean {
  // Pure heading (starts with # or is all caps short text)
  if (/^#{1,6}\s/.test(text)) return true;
  if (text.length < 40 && text === text.toUpperCase()) return true;

  // Questions are not claims
  if (text.endsWith('?')) return true;

  // Bare list marker with no verb
  if (/^[-*]\s*\w+$/.test(text)) return true;

  return false;
}

/**
 * Classify a sentence into one of the four claim types using
 * keyword pattern matching.
 */
function classifyClaimType(text: string): Claim['type'] {
  // Check in order of specificity: recommendation > inference > opinion > factual

  for (const pattern of RECOMMENDATION_PATTERNS) {
    if (pattern.test(text)) return 'recommendation';
  }

  for (const pattern of INFERENCE_PATTERNS) {
    if (pattern.test(text)) return 'inference';
  }

  for (const pattern of OPINION_PATTERNS) {
    if (pattern.test(text)) return 'opinion';
  }

  // Default: treat as factual assertion
  return 'factual';
}
