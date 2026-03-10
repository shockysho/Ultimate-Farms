// ============================================================
// DEMIURGOS — DMN Source Curation
// ============================================================
//
// Curated, diverse source URLs for the DMN Wanderer.
// Deliberately broad — the DMN reads widely to find
// unexpected cross-domain connections.

export interface WanderingSource {
  url: string;
  domain: string;
  type: 'api' | 'page';
  description: string;
}

/**
 * Curated sources organized by domain.
 * The DMN picks randomly from these during wandering.
 */
const sourceCatalog: WanderingSource[] = [
  // --- Tech & Innovation ---
  { url: 'https://hacker-news.firebaseio.com/v0/topstories.json', domain: 'technology', type: 'api', description: 'Hacker News top stories' },
  { url: 'https://lobste.rs/hottest.json', domain: 'technology', type: 'api', description: 'Lobsters tech news' },

  // --- Science ---
  { url: 'https://en.wikipedia.org/wiki/Special:Random', domain: 'general', type: 'page', description: 'Wikipedia random article' },
  { url: 'https://www.sciencedaily.com/news/plants_animals/agriculture_and_food/', domain: 'agriculture', type: 'page', description: 'ScienceDaily agriculture' },
  { url: 'https://www.sciencedaily.com/news/mind_brain/behavior/', domain: 'psychology', type: 'page', description: 'ScienceDaily behavior' },

  // --- Agriculture ---
  { url: 'https://www.poultryworld.net/', domain: 'agriculture', type: 'page', description: 'Poultry World news' },
  { url: 'https://www.wattagnet.com/', domain: 'agriculture', type: 'page', description: 'WATTAgNet poultry industry' },
  { url: 'https://www.fao.org/newsroom/en/', domain: 'agriculture', type: 'page', description: 'FAO newsroom' },

  // --- Business & Economics ---
  { url: 'https://www.bbc.com/news/business', domain: 'business', type: 'page', description: 'BBC Business news' },
  { url: 'https://en.wikipedia.org/wiki/Category:Management_science', domain: 'management', type: 'page', description: 'Wikipedia management science' },

  // --- Engineering & Systems ---
  { url: 'https://en.wikipedia.org/wiki/Category:Systems_engineering', domain: 'engineering', type: 'page', description: 'Wikipedia systems engineering' },
  { url: 'https://en.wikipedia.org/wiki/Category:Process_management', domain: 'engineering', type: 'page', description: 'Wikipedia process management' },

  // --- Philosophy & Decision Making ---
  { url: 'https://en.wikipedia.org/wiki/Category:Decision-making', domain: 'philosophy', type: 'page', description: 'Wikipedia decision-making' },
  { url: 'https://en.wikipedia.org/wiki/Category:Cognitive_biases', domain: 'psychology', type: 'page', description: 'Wikipedia cognitive biases' },

  // --- Biology & Nature (structural analogies) ---
  { url: 'https://en.wikipedia.org/wiki/Category:Biological_systems', domain: 'biology', type: 'page', description: 'Wikipedia biological systems' },
  { url: 'https://en.wikipedia.org/wiki/Category:Ecology', domain: 'biology', type: 'page', description: 'Wikipedia ecology' },

  // --- Supply Chain & Operations ---
  { url: 'https://en.wikipedia.org/wiki/Category:Supply_chain_management', domain: 'operations', type: 'page', description: 'Wikipedia supply chain' },
  { url: 'https://en.wikipedia.org/wiki/Category:Lean_manufacturing', domain: 'operations', type: 'page', description: 'Wikipedia lean manufacturing' },

  // --- Africa & Development ---
  { url: 'https://www.africanews.com/business/', domain: 'africa', type: 'page', description: 'Africanews business' },
];

/**
 * Get a random selection of sources for a wandering session.
 * Ensures diversity by picking from different domains.
 */
export function getWanderingSources(count = 5): WanderingSource[] {
  // Group by domain
  const byDomain = new Map<string, WanderingSource[]>();
  for (const source of sourceCatalog) {
    const existing = byDomain.get(source.domain) ?? [];
    existing.push(source);
    byDomain.set(source.domain, existing);
  }

  const selected: WanderingSource[] = [];
  const domains = [...byDomain.keys()];

  // Shuffle domains
  for (let i = domains.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [domains[i], domains[j]] = [domains[j], domains[i]];
  }

  // Pick one from each domain until we have enough
  let domainIndex = 0;
  while (selected.length < count && domainIndex < domains.length * 2) {
    const domain = domains[domainIndex % domains.length];
    const sources = byDomain.get(domain)!;
    const randomSource = sources[Math.floor(Math.random() * sources.length)];

    if (!selected.includes(randomSource)) {
      selected.push(randomSource);
    }
    domainIndex++;
  }

  return selected;
}

/**
 * Resolve an API source to actual page URLs.
 * For example, Hacker News API returns story IDs → fetch individual URLs.
 */
export async function resolveAPISource(source: WanderingSource): Promise<string[]> {
  if (source.type !== 'api') return [source.url];

  try {
    if (source.url.includes('hacker-news')) {
      // Hacker News: get top story IDs, then fetch a few
      const resp = await fetch(source.url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return [];
      const ids = await resp.json() as number[];
      const urls: string[] = [];

      for (const id of ids.slice(0, 3)) {
        try {
          const storyResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(3000) });
          if (storyResp.ok) {
            const story = await storyResp.json() as { url?: string; title?: string };
            if (story.url) urls.push(story.url);
          }
        } catch { /* skip */ }
      }
      return urls;
    }

    if (source.url.includes('lobste.rs')) {
      const resp = await fetch(source.url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return [];
      const stories = await resp.json() as { url: string }[];
      return stories.slice(0, 3).map(s => s.url).filter(Boolean);
    }

    return [source.url];
  } catch {
    return [];
  }
}

/**
 * Get all available source domains.
 */
export function getSourceDomains(): string[] {
  return [...new Set(sourceCatalog.map(s => s.domain))];
}

/**
 * Get total number of curated sources.
 */
export function getSourceCount(): number {
  return sourceCatalog.length;
}
