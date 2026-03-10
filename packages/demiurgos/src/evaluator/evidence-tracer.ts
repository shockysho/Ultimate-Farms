// ============================================================
// DEMIURGOS — Evidence Tracer
// ============================================================
//
// Traces claims against the knowledge base to compute
// evidence-grounded confidence tiers.
//
// Tier 5 (0.95-1.0): User-verified or computed from data
// Tier 4 (0.80-0.94): Authoritative source found
// Tier 3 (0.65-0.79): Multiple sources agree
// Tier 2 (0.40-0.64): Single inference, no verification
// Tier 1 (0.10-0.39): Speculation, no basis
// Tier 0 (0.00-0.09): Explicitly unknown

import type { Claim, ClaimEvidence, ConfidenceTier } from '../types.js';
import type { VectorStore, SearchResult } from '../cache/vector-store.js';

// --- Configuration ---

/** Minimum similarity score for a knowledge hit to count as evidence. */
const MIN_EVIDENCE_SIMILARITY = 0.3;

/** High similarity threshold for authoritative match. */
const HIGH_SIMILARITY_THRESHOLD = 0.7;

/** Number of knowledge results to retrieve per claim. */
const EVIDENCE_TOP_K = 5;

// --- Keyword patterns for heuristic scoring ---

const CITATION_PATTERNS = [
  /according to/i,
  /\bsource:/i,
  /\bref:/i,
  /\bstudy\b/i,
  /\bpaper\b/i,
  /\bresearch\b/i,
  /\bfound that\b/i,
  /\breported\b/i,
  /\bpublished\b/i,
];

const COMPUTED_PATTERNS = [
  /\bcalculated\b/i,
  /\bcomputed\b/i,
  /\bmeasured\b/i,
  /\bobserved\b/i,
  /\brecorded\b/i,
  /\bdata shows\b/i,
];

const UNCERTAINTY_PATTERNS = [
  /\bprobably\b/i,
  /\bmight\b/i,
  /\bcould be\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
  /\bi think\b/i,
  /\bseems?\b/i,
  /\bappears? to\b/i,
];

const UNKNOWN_PATTERNS = [
  /\bunknown\b/i,
  /\bunclear\b/i,
  /\bno data\b/i,
  /\binsufficient\b/i,
  /\bnot (?:yet )?(?:known|determined|established)\b/i,
  /\bcannot (?:be )?(?:determined|verified)\b/i,
];

/**
 * Trace a single claim against the knowledge store to determine
 * its evidence tier and confidence.
 */
export function traceClaim(
  claim: Claim,
  knowledgeStore: VectorStore | null,
): ClaimEvidence {
  // Step 1: Search knowledge base for supporting sources
  const hits = knowledgeStore
    ? knowledgeStore.search(claim.text, EVIDENCE_TOP_K, MIN_EVIDENCE_SIMILARITY)
    : [];

  const sources = hits.map(h => h.entry.metadata.source as string ?? h.entry.text.slice(0, 80));

  // Step 2: Compute tier based on evidence + heuristics
  const { tier, confidence, reason } = computeEvidenceTier(claim, hits);

  return {
    claim,
    tier,
    confidence,
    sources,
    reason,
  };
}

/**
 * Batch-trace all claims against the knowledge store.
 */
export function traceAllClaims(
  claims: Claim[],
  knowledgeStore: VectorStore | null,
): ClaimEvidence[] {
  return claims.map(claim => traceClaim(claim, knowledgeStore));
}

// --- Internal: Tier computation ---

function computeEvidenceTier(
  claim: Claim,
  hits: SearchResult[],
): { tier: ConfidenceTier; confidence: number; reason: string } {
  const text = claim.text;

  // Tier 0: Explicitly unknown
  if (matchesAny(text, UNKNOWN_PATTERNS)) {
    return {
      tier: 0,
      confidence: 0.05,
      reason: 'Claim explicitly acknowledges uncertainty or missing data',
    };
  }

  // Check knowledge base hits
  const strongHits = hits.filter(h => h.similarity >= HIGH_SIMILARITY_THRESHOLD);
  const moderateHits = hits.filter(
    h => h.similarity >= MIN_EVIDENCE_SIMILARITY && h.similarity < HIGH_SIMILARITY_THRESHOLD,
  );

  // Tier 5: Computed from data (heuristic: claim references computation
  // AND has strong knowledge base support)
  if (matchesAny(text, COMPUTED_PATTERNS) && strongHits.length > 0) {
    return {
      tier: 5,
      confidence: 0.95,
      reason: `Computed/measured claim with strong knowledge base match (similarity: ${strongHits[0].similarity.toFixed(2)})`,
    };
  }

  // Tier 4: Authoritative source found (strong single hit or citation + moderate hit)
  if (strongHits.length >= 1) {
    const bestSim = strongHits[0].similarity;
    return {
      tier: 4,
      confidence: 0.80 + (bestSim - HIGH_SIMILARITY_THRESHOLD) * 0.47, // maps 0.7-1.0 -> 0.80-0.94
      reason: `Authoritative knowledge base match found (similarity: ${bestSim.toFixed(2)})`,
    };
  }

  if (matchesAny(text, CITATION_PATTERNS) && moderateHits.length >= 1) {
    return {
      tier: 4,
      confidence: 0.82,
      reason: 'Cites a source with partial knowledge base corroboration',
    };
  }

  // Tier 3: Multiple sources agree (multiple moderate hits)
  if (moderateHits.length >= 2) {
    const avgSim = moderateHits.reduce((s, h) => s + h.similarity, 0) / moderateHits.length;
    return {
      tier: 3,
      confidence: 0.65 + avgSim * 0.2, // maps to ~0.65-0.79
      reason: `${moderateHits.length} knowledge base entries partially support this claim`,
    };
  }

  // Tier 3: Citation keyword present (claims referencing sources even without KB match)
  if (matchesAny(text, CITATION_PATTERNS)) {
    return {
      tier: 3,
      confidence: 0.68,
      reason: 'Cites a source (not verified against knowledge base)',
    };
  }

  // Tier 2: Single inference, some basis but no strong verification
  if (moderateHits.length === 1) {
    return {
      tier: 2,
      confidence: 0.55,
      reason: 'Single weak knowledge base match — insufficient for verification',
    };
  }

  // Tier 2: Factual claim with numbers but no KB support
  if (claim.type === 'factual' && /\d+/.test(text)) {
    return {
      tier: 2,
      confidence: 0.50,
      reason: 'Factual claim with numeric data but no knowledge base verification',
    };
  }

  // Tier 2: Plain factual claim, no evidence
  if (claim.type === 'factual') {
    return {
      tier: 2,
      confidence: 0.45,
      reason: 'Factual assertion without supporting evidence',
    };
  }

  // Tier 2: Recommendation or inference without evidence
  if (claim.type === 'recommendation' || claim.type === 'inference') {
    return {
      tier: 2,
      confidence: 0.40,
      reason: `${capitalize(claim.type)} without knowledge base verification`,
    };
  }

  // Tier 1: Opinion / speculation
  if (claim.type === 'opinion' || matchesAny(text, UNCERTAINTY_PATTERNS)) {
    return {
      tier: 1,
      confidence: 0.25,
      reason: 'Opinion or speculation without supporting evidence',
    };
  }

  // Tier 1: Fallback — unclassified with no evidence
  return {
    tier: 1,
    confidence: 0.30,
    reason: 'No evidence found in knowledge base',
  };
}

// --- Helpers ---

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
