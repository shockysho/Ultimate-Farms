// ============================================================
// DEMIURGOS — Coherence Tester
// ============================================================
//
// Tests the logical coherence of LLM output using heuristics.
// No LLM call needed — pure text analysis.
//
// Dimensions:
//   chainIntegrity          — Do conclusions follow from premises?
//   consistency             — Are there internal contradictions?
//   counterArgumentResilience — Are claims appropriately hedged?
//   trackRecord             — Placeholder (calibrated from feedback later)

import type { CoherenceResult } from '../types.js';

// --- Logical connector patterns ---

const PREMISE_CONNECTORS = [
  /\bbecause\b/i,
  /\bsince\b/i,
  /\bgiven that\b/i,
  /\bdue to\b/i,
  /\bas a result of\b/i,
  /\bowing to\b/i,
];

const CONCLUSION_CONNECTORS = [
  /\btherefore\b/i,
  /\bthus\b/i,
  /\bhence\b/i,
  /\bconsequently\b/i,
  /\bas a result\b/i,
  /\bso\b/i,
  /\bthis means\b/i,
  /\bit follows\b/i,
  /\bwe can conclude\b/i,
  /\bin conclusion\b/i,
];

const BUILDING_CONNECTORS = [
  /\bfurthermore\b/i,
  /\bmoreover\b/i,
  /\badditionally\b/i,
  /\bin addition\b/i,
  /\bbuilding on\b/i,
  /\bsimilarly\b/i,
  /\blikewise\b/i,
  /\balso\b/i,
];

const NEGATION_WORDS = [
  "don't", "doesn't", "isn't", "aren't", "won't", "can't",
  "shouldn't", "not", "never", "no", "neither", "nor",
  "cannot", "couldn't", "wouldn't", "wasn't", "weren't",
];

const HEDGE_PATTERNS = [
  /\bprobably\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
  /\bseems?\b/i,
  /\bappears?\b/i,
  /\btends? to\b/i,
  /\bgenerally\b/i,
  /\btypically\b/i,
  /\boften\b/i,
  /\busually\b/i,
  /\bin (?:many|some|most) cases\b/i,
];

const DEFINITIVE_PATTERNS = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bdefinitely\b/i,
  /\bcertainly\b/i,
  /\babsolutely\b/i,
  /\bwithout (?:a )?doubt\b/i,
  /\bundeniably\b/i,
  /\bunquestionably\b/i,
  /\bguaranteed\b/i,
  /\b100%\b/i,
];

/**
 * Test the logical coherence of output text using heuristic analysis.
 *
 * @param output  - The LLM output to test
 * @param reasoning - Optional chain-of-thought / reasoning trace
 */
export function testCoherence(output: string, reasoning?: string): CoherenceResult {
  const fullText = reasoning ? `${reasoning}\n\n${output}` : output;

  const chainIntegrity = scoreChainIntegrity(fullText);
  const consistency = scoreConsistency(fullText);
  const counterArgumentResilience = scoreCounterArgumentResilience(fullText);
  const trackRecord = 0.5; // Placeholder — calibrated from feedback data later

  const overall =
    chainIntegrity * 0.3 +
    consistency * 0.3 +
    counterArgumentResilience * 0.25 +
    trackRecord * 0.15;

  return {
    chainIntegrity,
    consistency,
    counterArgumentResilience,
    trackRecord,
    overall,
  };
}

// --- Chain Integrity ---
// Checks if conclusions follow from premises by looking for logical
// connectors and verifying that claims build on each other.

function scoreChainIntegrity(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return 0.5; // Can't assess chain with single sentence

  let score = 0.5; // Baseline

  // Count logical structure markers
  const premiseCount = countMatches(text, PREMISE_CONNECTORS);
  const conclusionCount = countMatches(text, CONCLUSION_CONNECTORS);
  const buildingCount = countMatches(text, BUILDING_CONNECTORS);

  const totalConnectors = premiseCount + conclusionCount + buildingCount;
  const sentenceCount = sentences.length;

  // Good chain: reasonable ratio of connectors to sentences
  // Expect roughly 1 connector per 3-4 sentences in well-structured text
  const connectorRatio = totalConnectors / sentenceCount;

  if (connectorRatio >= 0.2 && connectorRatio <= 0.6) {
    // Well-structured: has connectors but not over-connected
    score += 0.2;
  } else if (connectorRatio > 0) {
    // Some structure present
    score += 0.1;
  }

  // Bonus: conclusions are preceded by premises
  if (premiseCount > 0 && conclusionCount > 0) {
    score += 0.15;
  }

  // Bonus: claims build on each other (building connectors present)
  if (buildingCount > 0) {
    score += 0.05;
  }

  // Penalty: conclusions without any premises
  if (conclusionCount > 0 && premiseCount === 0 && buildingCount === 0) {
    score -= 0.15;
  }

  return clamp(score);
}

// --- Consistency ---
// Checks for contradictions by looking for negation patterns near
// similar terms within the same output.

function scoreConsistency(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return 0.8; // Single sentence is self-consistent

  let contradictionPenalty = 0;

  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (detectContradiction(sentences[i], sentences[j])) {
        contradictionPenalty += 0.25;
      }
    }
  }

  // Start at high consistency, subtract penalties
  return clamp(0.9 - contradictionPenalty);
}

/**
 * Detect if two sentences contradict each other.
 * Looks for one sentence negating what the other asserts,
 * while sharing significant vocabulary overlap.
 */
function detectContradiction(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const aWords = new Set(aLower.split(/\s+/).filter(w => w.length > 3));
  const bWords = new Set(bLower.split(/\s+/).filter(w => w.length > 3));

  // Need meaningful word overlap for a potential contradiction
  const overlap = [...aWords].filter(w => bWords.has(w));
  const overlapRatio = overlap.length / Math.max(aWords.size, bWords.size);

  if (overlapRatio < 0.3) return false; // Not enough overlap to be contradictory

  // Check if one negates what the other asserts
  for (const neg of NEGATION_WORDS) {
    const aHasNeg = aLower.includes(neg);
    const bHasNeg = bLower.includes(neg);

    // One has negation, the other doesn't, and they share topic words
    if (aHasNeg !== bHasNeg && overlapRatio > 0.4) {
      return true;
    }
  }

  return false;
}

// --- Counter-Argument Resilience ---
// Scores based on how appropriately hedged vs definitive the claims are.
// Honest hedging on uncertain topics = higher score.
// Over-definitive claims = lower score (easier to counter-argue).

function scoreCounterArgumentResilience(text: string): number {
  const hedgeCount = countMatches(text, HEDGE_PATTERNS);
  const definitiveCount = countMatches(text, DEFINITIVE_PATTERNS);

  const total = hedgeCount + definitiveCount;
  if (total === 0) return 0.5; // Neutral — no strong signals

  // High hedge ratio = appropriately uncertain = harder to counter-argue
  // High definitive ratio = over-confident = easier to counter-argue
  const hedgeRatio = hedgeCount / total;

  // Pure hedging: 0.7 (good but not perfect — too much hedging is evasive)
  // Pure definitive: 0.3 (bad — over-confident)
  // Balanced mix: 0.6 (reasonable)
  if (hedgeRatio > 0.8) {
    // Mostly hedged — good epistemic humility but slightly evasive
    return 0.65;
  } else if (hedgeRatio > 0.5) {
    // Good balance — hedged where appropriate
    return 0.70;
  } else if (hedgeRatio > 0.2) {
    // Leaning definitive but with some hedging
    return 0.55;
  } else {
    // Mostly definitive — vulnerable to counter-arguments
    return 0.35;
  }
}

// --- Helpers ---

function splitSentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(new RegExp(pattern.source, 'gi'));
    if (matches) count += matches.length;
  }
  return count;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
