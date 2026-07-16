// ============================================================
// DEMIURGOS — Hive Mind Synthesizer
// ============================================================
//
// For complex questions, generates multiple perspectives
// from different domains and synthesizes them into a
// unified recommendation.

import type { Provider } from '../types.js';
import { searchKnowledge } from '../knowledge/ingestor.js';

export interface Perspective {
  domain: string;
  analysis: string;
  confidence: number;
}

export interface SynthesisResult {
  perspectives: Perspective[];
  synthesis: string;
  recommendation: string;
  tradeoffs: string[];
  domains: string[];
}

const DOMAIN_LENSES: Record<string, string> = {
  financial: 'You are a financial analyst. Focus on costs, ROI, cash flow, risk, and economic viability.',
  agricultural: 'You are an agricultural scientist. Focus on production, biology, crop/animal science, and best practices.',
  engineering: 'You are an engineer. Focus on infrastructure, equipment, technical feasibility, and reliability.',
  operational: 'You are an operations manager. Focus on workflows, staffing, efficiency, and process optimization.',
  market: 'You are a market analyst. Focus on demand, pricing, competition, and market trends.',
};

/**
 * Identify which domains are relevant to a question.
 */
export function identifyDomains(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const domains: string[] = [];

  const domainSignals: Record<string, string[]> = {
    financial: ['cost', 'price', 'budget', 'invest', 'roi', 'revenue', 'profit', 'expense', 'afford', 'money'],
    agricultural: ['farm', 'poultry', 'chicken', 'egg', 'feed', 'crop', 'soil', 'grow', 'breed', 'flock'],
    engineering: ['build', 'install', 'pump', 'motor', 'pipe', 'cool', 'ventilat', 'structure', 'equipment'],
    operational: ['staff', 'schedule', 'process', 'workflow', 'manage', 'team', 'train', 'operate'],
    market: ['sell', 'customer', 'market', 'demand', 'compet', 'pricing', 'wholesale', 'retail'],
  };

  for (const [domain, signals] of Object.entries(domainSignals)) {
    if (signals.some(s => lower.includes(s))) {
      domains.push(domain);
    }
  }

  // Always include at least 2 domains for diverse perspective
  if (domains.length < 2) {
    if (!domains.includes('financial')) domains.push('financial');
    if (!domains.includes('operational') && domains.length < 2) domains.push('operational');
  }

  return domains;
}

/**
 * Generate multi-perspective synthesis for a complex question.
 */
export async function synthesize(
  prompt: string,
  model: Provider,
  domains?: string[],
): Promise<SynthesisResult> {
  const relevantDomains = domains ?? identifyDomains(prompt);

  // Step 1: Gather knowledge for each domain
  const perspectives: Perspective[] = [];

  for (const domain of relevantDomains) {
    const knowledge = searchKnowledge(prompt, 3, 0.2);
    const domainKnowledge = knowledge
      .filter(k => k.domain === domain || k.similarity > 0.5)
      .map(k => k.text)
      .join('\n\n');

    const lens = DOMAIN_LENSES[domain] ?? `You are an expert in ${domain}.`;

    const perspectivePrompt = `${lens}

Context from knowledge base:
${domainKnowledge || '(No specific knowledge available for this domain)'}

Question: ${prompt}

Provide your expert analysis from the ${domain} perspective. Be specific and actionable.
Focus on what matters most from YOUR domain's viewpoint.
Include numbers and specifics where possible.`;

    try {
      const response = await model.generate(perspectivePrompt, lens, {
        temperature: 0.5,
        maxTokens: 500,
      });

      perspectives.push({
        domain,
        analysis: response.content,
        confidence: domainKnowledge ? 0.7 : 0.4,
      });
    } catch {
      perspectives.push({
        domain,
        analysis: `Unable to generate ${domain} perspective.`,
        confidence: 0,
      });
    }
  }

  // Step 2: Synthesize perspectives
  const perspectiveSummary = perspectives
    .map(p => `## ${p.domain.toUpperCase()} PERSPECTIVE:\n${p.analysis}`)
    .join('\n\n');

  const synthesisPrompt = `Multiple domain experts have analyzed this question:

QUESTION: ${prompt}

${perspectiveSummary}

Now synthesize these perspectives into a unified response:
1. SYNTHESIS: What do the perspectives agree on? Where do they conflict?
2. RECOMMENDATION: Given all perspectives, what should be done?
3. TRADEOFFS: What are the key tradeoffs to consider?

Be concise and actionable. Return as JSON:
{
  "synthesis": "unified analysis",
  "recommendation": "clear recommendation",
  "tradeoffs": ["tradeoff 1", "tradeoff 2"]
}`;

  try {
    const response = await model.generate(synthesisPrompt, 'You synthesize multiple expert perspectives. Return valid JSON.', {
      temperature: 0.3,
      maxTokens: 800,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        synthesis: string;
        recommendation: string;
        tradeoffs: string[];
      };

      return {
        perspectives,
        synthesis: parsed.synthesis,
        recommendation: parsed.recommendation,
        tradeoffs: parsed.tradeoffs ?? [],
        domains: relevantDomains,
      };
    }
  } catch {
    // Fallback
  }

  return {
    perspectives,
    synthesis: perspectives.map(p => `[${p.domain}] ${p.analysis}`).join('\n'),
    recommendation: 'Multiple perspectives gathered. Review each domain analysis above.',
    tradeoffs: [],
    domains: relevantDomains,
  };
}
