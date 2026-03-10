// ============================================================
// DEMIURGOS — Study Planner
// ============================================================
//
// Takes knowledge gaps and plans what to study.
// Generates search queries and source priorities.

import type { KnowledgeGap } from './gap-detector.js';

export interface StudyPlan {
  gap: KnowledgeGap;
  searchQueries: string[];
  suggestedSources: string[];
  priority: number; // 1 = highest
}

/**
 * Generate study plans from detected gaps.
 */
export function generateStudyPlans(gaps: KnowledgeGap[]): StudyPlan[] {
  return gaps.map((gap, index) => ({
    gap,
    searchQueries: generateQueries(gap),
    suggestedSources: suggestSources(gap),
    priority: index + 1,
  }));
}

function generateQueries(gap: KnowledgeGap): string[] {
  const queries: string[] = [];

  // Extract key topics from example prompts
  for (const prompt of gap.examplePrompts) {
    // Remove question words and common filler
    const cleaned = prompt
      .replace(/\b(what|how|why|when|where|who|is|are|the|a|an|do|does|should|can|could|would)\b/gi, '')
      .replace(/[?!.,]/g, '')
      .trim();

    if (cleaned.length > 5) {
      queries.push(`${cleaned} guide`);
      queries.push(`${cleaned} best practices`);
    }
  }

  // Add domain-specific queries
  switch (gap.domain) {
    case 'farming':
      queries.push(`poultry ${gap.description.split("'")[1] || 'management'} USDA guide`);
      queries.push(`poultry farming best practices FAO`);
      break;
    case 'finance':
      queries.push(`farm financial management guide`);
      queries.push(`agricultural business economics`);
      break;
    case 'engineering':
      queries.push(`agricultural engineering handbook`);
      queries.push(`farm infrastructure design guide`);
      break;
    case 'code':
      queries.push(`${gap.examplePrompts[0] ?? 'programming'} tutorial`);
      break;
  }

  return [...new Set(queries)].slice(0, 5); // Deduplicate, max 5
}

/**
 * Gap type classification for source recommendation.
 */
type GapType = 'factual' | 'practical' | 'technical' | 'general';

/**
 * Classify a knowledge gap by type based on description and domain.
 */
function classifyGapType(gap: KnowledgeGap): GapType {
  const desc = gap.description.toLowerCase();
  const prompts = gap.examplePrompts.join(' ').toLowerCase();
  const combined = `${desc} ${prompts}`;

  // Practical: how-to, setup, build, configure, process
  if (/\b(how to|setup|build|configure|install|process|step|procedure|tutorial)\b/.test(combined)) {
    return 'practical';
  }

  // Technical: code, debug, error, api, implementation
  if (/\b(code|debug|error|api|implement|function|bug|stack trace|exception|compile)\b/.test(combined)) {
    return 'technical';
  }

  // Factual: what is, define, explain, facts, data, statistics
  if (/\b(what is|define|explain|fact|data|statistic|regulation|standard|specification)\b/.test(combined)) {
    return 'factual';
  }

  // Domain-based defaults
  if (gap.domain === 'code') return 'technical';
  if (gap.domain === 'farming' || gap.domain === 'finance') return 'factual';

  return 'general';
}

function suggestSources(gap: KnowledgeGap): string[] {
  const gapType = classifyGapType(gap);

  // Base sources by domain
  const domainSources: Record<string, string[]> = {
    farming: [
      'usda — USDA poultry production guides (ingest-usda)',
      'wikipedia — poultry science articles (ingest-wiki)',
      'youtube — poultry farming channels (ingest-youtube)',
      'web — FAO livestock management',
    ],
    finance: [
      'usda — USDA economic research service (ingest-usda)',
      'wikipedia — agricultural economics (ingest-wiki)',
      'stackexchange — personal finance SE (ingest via CLI)',
      'web — farm financial management guides',
    ],
    engineering: [
      'stackexchange — engineering SE (ingest via CLI)',
      'youtube — engineering tutorials (ingest-youtube)',
      'usda — USDA NRCS technical guides (ingest-usda)',
      'web — equipment manufacturer specs',
    ],
    code: [
      'stackexchange — Stack Overflow (ingest via CLI)',
      'web — MDN Web Docs, TypeScript docs',
      'youtube — programming tutorials (ingest-youtube)',
      'wikipedia — computing concepts (ingest-wiki)',
    ],
    management: [
      'wikipedia — management practices (ingest-wiki)',
      'web — ISO quality management standards',
      'youtube — farm management courses (ingest-youtube)',
      'stackexchange — workplace SE (ingest via CLI)',
    ],
    general: [
      'wikipedia — general reference (ingest-wiki)',
      'web — OpenStax textbooks, Khan Academy',
      'youtube — educational channels (ingest-youtube)',
    ],
  };

  const baseSources = domainSources[gap.domain] ?? domainSources.general;

  // Prioritize sources based on gap type
  const prioritySources: Record<GapType, string[]> = {
    factual: [
      'usda — official USDA documents (authority: 0.95)',
      'wikipedia — encyclopedic reference (authority: 0.7)',
    ],
    practical: [
      'youtube — video tutorials and demonstrations',
      'web — step-by-step guides and how-tos',
    ],
    technical: [
      'stackexchange — community Q&A with voted answers',
      'web — official documentation and references',
    ],
    general: [
      'wikipedia — broad topic overview',
      'web — general web search',
    ],
  };

  // Combine priority sources with domain sources, deduplicating
  const priority = prioritySources[gapType];
  const combined = [...priority, ...baseSources];
  const seen = new Set<string>();

  return combined.filter(s => {
    const key = s.split(' — ')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}
