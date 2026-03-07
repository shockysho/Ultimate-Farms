// ============================================================
// DEMIURGOS — Evaluator (Evidence-Grounded + Coherence Confidence)
// ============================================================

import type {
  Contract, EvaluationResult, ClaimConfidence,
  ConfidenceTier, Provider,
} from './types.js';

// --- Main Evaluation ---

export async function evaluate(
  output: string,
  contract: Contract,
  evaluatorModel: Provider,
): Promise<EvaluationResult> {
  // Step 1: Check constitution (hard rules) — instant fail
  const violations = checkConstitution(output, contract);

  if (violations.length > 0) {
    return failResult(violations);
  }

  // Step 2: Score dimensions using evaluator model
  const scores = await scoreDimensions(output, contract, evaluatorModel);

  // Step 3: Compute evidence-grounded confidence (per-claim)
  const claims = extractClaims(output);
  const claimConfidences = claims.map(claim => computeClaimConfidence(claim));
  const overallEvidenceConfidence = claimConfidences.length > 0
    ? claimConfidences.reduce((sum, c) => sum + c.confidence, 0) / claimConfidences.length
    : 0.5;

  // Step 4: Compute model-coherence confidence
  const coherence = await computeCoherence(output, contract, evaluatorModel);

  // Step 5: Combine into total confidence
  const totalConfidence = (overallEvidenceConfidence * 0.6) + (coherence.overall * 0.4);

  // Step 6: Compute composite score
  const w = contract.thresholds.weights;
  const compositeScore =
    scores.accuracy * w[0] +
    scores.completeness * w[1] +
    scores.relevance * w[2] +
    scores.actionability * w[3] +
    scores.specificity * w[4];

  // Step 7: Determine verdict
  const meetsThreshold = compositeScore >= weightedThreshold(contract);
  const confidenceIsHigh = totalConfidence >= contract.minEvaluatorConfidence;

  let verdict: 'pass' | 'fail' | 'uncertain';
  if (meetsThreshold && confidenceIsHigh) {
    verdict = 'pass';
  } else if (!meetsThreshold && confidenceIsHigh) {
    verdict = 'fail';
  } else {
    verdict = 'uncertain'; // Escalate evaluator, not model
  }

  return {
    scores,
    claimConfidences,
    overallEvidenceConfidence,
    coherence,
    totalConfidence,
    constitutionViolations: violations,
    compositeScore,
    verdict,
  };
}

// --- Constitution Check ---

function checkConstitution(output: string, contract: Contract): string[] {
  const violations: string[] = [];
  const lower = output.toLowerCase();

  for (const rule of contract.hardRules) {
    switch (rule.id) {
      case 'no-hallucination':
        // Check for hallucination markers
        if (hasHallucinationMarkers(output)) {
          violations.push(`[${rule.id}] ${rule.rule}`);
        }
        break;

      case 'no-contradiction':
        // Basic contradiction detection (model-assisted in production)
        if (hasContradiction(output)) {
          violations.push(`[${rule.id}] ${rule.rule}`);
        }
        break;

      case 'answer-the-question':
        // Check if output is on-topic (basic heuristic)
        if (output.trim().length < 20) {
          violations.push(`[${rule.id}] Response too short to address the question`);
        }
        break;

      case 'no-generic':
        // Check for generic filler without substance
        if (isGenericFiller(lower)) {
          violations.push(`[${rule.id}] ${rule.rule}`);
        }
        break;
    }
  }

  return violations;
}

function hasHallucinationMarkers(text: string): boolean {
  // Fake citations, made-up URLs, invented statistics
  const fakeUrlPattern = /https?:\/\/(?:www\.)?[a-z]+\.com\/[a-z0-9]{20,}/;
  const fakeDoiPattern = /doi:\s*10\.\d{4}\/[a-z0-9]{20,}/;
  return fakeUrlPattern.test(text) || fakeDoiPattern.test(text);
}

function hasContradiction(text: string): boolean {
  // Simple heuristic: same sentence saying X and not X
  // Full implementation would use model-assisted detection
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (areContradictory(sentences[i], sentences[j])) return true;
    }
  }
  return false;
}

function areContradictory(a: string, b: string): boolean {
  // Very basic: check if one negates the other
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const negations = ["don't", "doesn't", "isn't", "aren't", "won't", "can't", "shouldn't", "not"];
  for (const neg of negations) {
    if (aLower.includes(neg) && !bLower.includes(neg) &&
        similarity(aLower.replace(neg, ''), bLower) > 0.8) {
      return true;
    }
  }
  return false;
}

function similarity(a: string, b: string): number {
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  return intersection / Math.max(aWords.size, bWords.size);
}

function isGenericFiller(text: string): boolean {
  const fillerPhrases = [
    'it depends on many factors',
    'there are many options available',
    'this is a complex topic',
    'consult with a professional',
    'results may vary',
  ];
  const fillerCount = fillerPhrases.filter(p => text.includes(p)).length;
  return fillerCount >= 2;
}

// --- Dimension Scoring (Model-Assisted) ---

async function scoreDimensions(
  output: string,
  contract: Contract,
  evaluator: Provider,
): Promise<EvaluationResult['scores']> {
  const prompt = `You are evaluating an AI response against a quality contract.

Task type: ${contract.taskType}
Domain: ${contract.domain}
Required elements: ${contract.requiredElements.join(', ')}
Structural rules: ${contract.structuralRules.join('; ')}

RESPONSE TO EVALUATE:
${output}

Score each dimension from 0.0 to 1.0. Be strict and honest.
Return ONLY a JSON object with these exact keys:
{
  "accuracy": <float>,
  "completeness": <float>,
  "relevance": <float>,
  "actionability": <float>,
  "specificity": <float>
}`;

  try {
    const result = await evaluator.generate(prompt, 'You are a strict quality evaluator. Return only valid JSON.', {
      temperature: 0.1,
      maxTokens: 200,
    });

    const jsonMatch = result.content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        accuracy: clamp(parsed.accuracy ?? 0.5),
        completeness: clamp(parsed.completeness ?? 0.5),
        relevance: clamp(parsed.relevance ?? 0.5),
        actionability: clamp(parsed.actionability ?? 0.5),
        specificity: clamp(parsed.specificity ?? 0.5),
      };
    }
  } catch {
    // Fallback: heuristic scoring
  }

  return heuristicScore(output, contract);
}

function heuristicScore(output: string, contract: Contract): EvaluationResult['scores'] {
  const words = output.split(/\s+/).length;
  const hasStructure = /\n[-*]|\n\d\.|\n#{1,3}\s/.test(output);
  const hasNumbers = /\d+/.test(output);
  const hasCodeBlock = /```/.test(output);

  return {
    accuracy: 0.5,  // Can't assess without model
    completeness: clamp(Math.min(words / 200, 1.0)),
    relevance: 0.6,
    actionability: (hasNumbers || hasCodeBlock) ? 0.7 : 0.4,
    specificity: hasStructure ? 0.6 : 0.4,
  };
}

// --- Evidence-Grounded Confidence ---

function extractClaims(output: string): string[] {
  // Split output into individual sentences/claims
  return output
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)  // Skip trivially short fragments
    .slice(0, 10);  // Cap at 10 claims for performance
}

function computeClaimConfidence(claim: string): ClaimConfidence {
  // In production, this would search the vector DB for sources.
  // For now, use heuristic confidence based on claim characteristics.

  const hasNumber = /\d+/.test(claim);
  const hasCitation = /according to|source:|ref:|study|paper|research/i.test(claim);
  const isOpinion = /\bshould\b|\bi think\b|\bprobably\b|\bmight\b|\bcould be\b/i.test(claim);
  const isFactual = /\bis\b|\bare\b|\bwas\b|\bwere\b|\bhas\b|\bhave\b/i.test(claim) && !isOpinion;

  let confidence: number;
  let tier: ConfidenceTier;
  let reason: string;

  if (hasCitation) {
    confidence = 0.75;
    tier = 3;
    reason = 'Cites a source (verify source exists)';
  } else if (isFactual && hasNumber) {
    confidence = 0.55;
    tier = 2;
    reason = 'Factual claim with numbers but no cited source';
  } else if (isFactual) {
    confidence = 0.45;
    tier = 2;
    reason = 'Factual claim without source';
  } else if (isOpinion) {
    confidence = 0.30;
    tier = 1;
    reason = 'Opinion or speculation';
  } else {
    confidence = 0.40;
    tier = 2;
    reason = 'General statement';
  }

  return {
    claim,
    tier,
    confidence,
    sources: [],  // Will be populated when vector DB is integrated
    reason,
  };
}

// --- Model-Coherence Confidence ---

async function computeCoherence(
  output: string,
  contract: Contract,
  evaluator: Provider,
): Promise<EvaluationResult['coherence']> {
  const prompt = `Evaluate the logical coherence of this response. Score each dimension 0.0-1.0.

RESPONSE:
${output}

1. chain_integrity: Does each point logically follow from the previous? Any unsupported jumps?
2. consistency: Does any part contradict another part?
3. counter_argument_resilience: If you tried to argue against the main conclusion, how easy would it be? (1.0 = very hard to argue against, 0.0 = easily refuted)
4. track_record: Based on the reasoning quality, how reliable does this type of argument tend to be? (general assessment)

Return ONLY a JSON object:
{
  "chain_integrity": <float>,
  "consistency": <float>,
  "counter_argument_resilience": <float>,
  "track_record": <float>
}`;

  try {
    const result = await evaluator.generate(prompt, 'You are a logic evaluator. Return only valid JSON.', {
      temperature: 0.1,
      maxTokens: 200,
    });

    const jsonMatch = result.content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const chainIntegrity = clamp(parsed.chain_integrity ?? 0.5);
      const consistency = clamp(parsed.consistency ?? 0.5);
      const counterArgumentResilience = clamp(parsed.counter_argument_resilience ?? 0.5);
      const trackRecord = clamp(parsed.track_record ?? 0.5);

      return {
        chainIntegrity,
        consistency,
        counterArgumentResilience,
        trackRecord,
        overall: (chainIntegrity * 0.3 + consistency * 0.3 +
                  counterArgumentResilience * 0.25 + trackRecord * 0.15),
      };
    }
  } catch {
    // Fallback
  }

  return { chainIntegrity: 0.5, consistency: 0.5, counterArgumentResilience: 0.5, trackRecord: 0.5, overall: 0.5 };
}

// --- Helpers ---

function weightedThreshold(contract: Contract): number {
  const t = contract.thresholds;
  const w = t.weights;
  return t.accuracy * w[0] + t.completeness * w[1] + t.relevance * w[2] +
         t.actionability * w[3] + t.specificity * w[4];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function failResult(violations: string[]): EvaluationResult {
  return {
    scores: { accuracy: 0, completeness: 0, relevance: 0, actionability: 0, specificity: 0 },
    claimConfidences: [],
    overallEvidenceConfidence: 0,
    coherence: { chainIntegrity: 0, consistency: 0, counterArgumentResilience: 0, trackRecord: 0, overall: 0 },
    totalConfidence: 0,
    constitutionViolations: violations,
    compositeScore: 0,
    verdict: 'fail',
  };
}
