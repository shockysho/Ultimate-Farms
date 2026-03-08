// ============================================================
// DEMIURGOS — DMN Dreamer
// ============================================================
//
// Phase 3 of the Default Mode Network.
// Takes cross-domain associations and generates insights
// through deliberate recombination and analogical reasoning.

import type { Provider } from '../types.js';
import type { CrossDomainLink } from './association.js';

export interface DreamInsight {
  sourceA: { text: string; domain: string; source: string };
  sourceB: { text: string; domain: string; source: string };
  connection: string;
  analogy: string;
  applications: string[];
  noveltyScore: number;
  depthScore: number;
  createdAt: Date;
}

/**
 * "Dream" about cross-domain links — generate insights
 * through analogical reasoning.
 */
export async function dream(
  links: CrossDomainLink[],
  model: Provider,
): Promise<DreamInsight[]> {
  const insights: DreamInsight[] = [];

  for (const link of links.slice(0, 5)) { // Max 5 dreams per cycle
    try {
      const insight = await generateInsight(link, model);
      if (insight) {
        insights.push(insight);
      }
    } catch {
      // Dreams can fail — that's fine
      continue;
    }
  }

  return insights;
}

async function generateInsight(
  link: CrossDomainLink,
  model: Provider,
): Promise<DreamInsight | null> {
  const prompt = `You are finding hidden connections between two seemingly unrelated pieces of knowledge.

PIECE A (from ${link.entryA.domain}):
${link.entryA.text}

PIECE B (from ${link.entryB.domain}):
${link.entryB.text}

These are from completely different domains but share some structural similarity.

Answer these questions:
1. ANALOGY: What structural pattern do A and B share? What maps to what?
2. INSIGHT: What does A teach us about B (or vice versa) that isn't obvious?
3. APPLICATIONS: List 2-3 concrete things someone could DO with this connection.

Be specific and concrete. If there's no genuine connection, say "No meaningful connection found."

Return as JSON:
{
  "connection": "One sentence describing the structural link",
  "analogy": "The structural mapping explained",
  "applications": ["application 1", "application 2"],
  "novelty": 0.0 to 1.0,
  "depth": 0.0 to 1.0
}`;

  const response = await model.generate(prompt, 'You are a creative cross-domain thinker. Find structural analogies. Return only valid JSON.', {
    temperature: 0.8, // Higher temperature for creativity
    maxTokens: 500,
  });

  // Check for "no connection" response
  if (response.content.toLowerCase().includes('no meaningful connection')) {
    return null;
  }

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      connection: string;
      analogy: string;
      applications: string[];
      novelty: number;
      depth: number;
    };

    return {
      sourceA: link.entryA,
      sourceB: link.entryB,
      connection: parsed.connection,
      analogy: parsed.analogy,
      applications: parsed.applications ?? [],
      noveltyScore: parsed.novelty ?? 0.5,
      depthScore: parsed.depth ?? 0.5,
      createdAt: new Date(),
    };
  } catch {
    return null;
  }
}
