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
    suggestedSources: suggestSources(gap.domain),
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

function suggestSources(domain: string): string[] {
  const sources: Record<string, string[]> = {
    farming: [
      'USDA poultry production guides',
      'FAO livestock management',
      'Poultry science journals',
      'YouTube: poultry farming channels',
    ],
    finance: [
      'Agricultural economics textbooks',
      'Farm financial management guides',
      'USDA economic research service',
    ],
    engineering: [
      'Engineering handbooks',
      'USDA NRCS technical guides',
      'Equipment manufacturer specs',
    ],
    code: [
      'MDN Web Docs',
      'TypeScript documentation',
      'Stack Overflow',
    ],
    management: [
      'Farm management textbooks',
      'ISO quality management standards',
      'HR best practices guides',
    ],
    general: [
      'Wikipedia',
      'OpenStax textbooks',
      'Khan Academy',
    ],
  };

  return sources[domain] ?? sources.general;
}
