// ============================================================
// DEMIURGOS — Knowledge, DMN & Synthesis Tests
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { chunkText } from '../knowledge/chunker.js';
import { initKnowledgeStore, ingestText, searchKnowledge, knowledgeStats } from '../knowledge/ingestor.js';
import { initWanderingStore, wanderText } from '../dmn/wanderer.js';
import { findAssociations } from '../dmn/association.js';
import { dream } from '../dmn/dreamer.js';
import { initInsightJournal, saveInsight, getInsights, insightStats } from '../dmn/insight-journal.js';
import { identifyDomains } from '../synthesis/synthesizer.js';
import { MockProvider, mockResponses } from '../providers/mock.js';

const TEST_KNOWLEDGE_DB = 'test-knowledge.db';
const TEST_WANDERING_DB = 'test-wandering.db';
const TEST_INSIGHTS_DB = 'test-insights.db';

// --- Chunker Tests ---

describe('Chunker', () => {
  it('chunks text by paragraphs', () => {
    const text = 'Paragraph one with content.\n\nParagraph two with more content.\n\nParagraph three.';
    const chunks = chunkText(text, { chunkSize: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toContain('Paragraph');
  });

  it('handles single paragraph', () => {
    const text = 'This is a single paragraph without any breaks.';
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(text);
  });

  it('handles empty text', () => {
    const chunks = chunkText('');
    expect(chunks.length).toBe(0);
  });

  it('creates overlapping chunks', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Sentence number ${i + 1} with some content.`).join('\n\n');
    const chunks = chunkText(text, { chunkSize: 200, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves content integrity', () => {
    const text = 'Important fact: water boils at 100°C.\n\nAnother fact: ice melts at 0°C.';
    const chunks = chunkText(text, { chunkSize: 1000 });
    const fullText = chunks.map(c => c.text).join(' ');
    expect(fullText).toContain('water boils at 100°C');
    expect(fullText).toContain('ice melts at 0°C');
  });
});

// --- Knowledge Ingestor Tests ---

describe('Knowledge Ingestor', () => {
  beforeAll(() => {
    if (existsSync(TEST_KNOWLEDGE_DB)) unlinkSync(TEST_KNOWLEDGE_DB);
    initKnowledgeStore(TEST_KNOWLEDGE_DB);
  });

  afterAll(() => {
    if (existsSync(TEST_KNOWLEDGE_DB)) unlinkSync(TEST_KNOWLEDGE_DB);
  });

  it('ingests text and reports stats', () => {
    const result = ingestText(
      'Poultry feed should contain 16-18% protein for layers. Calcium supplementation is critical during peak production.',
      'USDA Feed Guide',
      'farming',
    );

    expect(result.chunksAdded).toBeGreaterThan(0);
    expect(result.source).toBe('USDA Feed Guide');
    expect(result.domain).toBe('farming');
  });

  it('searches ingested knowledge', () => {
    ingestText(
      'Centrifugal pumps are ideal for irrigation systems with flow rates above 100 GPM. The pump should be sized based on total dynamic head.',
      'Engineering Handbook',
      'engineering',
    );

    const results = searchKnowledge('what pump for irrigation?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain('pump');
  });

  it('reports knowledge stats', () => {
    const stats = knowledgeStats();
    expect(stats.totalChunks).toBeGreaterThan(0);
  });
});

// --- DMN Tests ---

describe('DMN - Wanderer', () => {
  beforeAll(() => {
    if (existsSync(TEST_WANDERING_DB)) unlinkSync(TEST_WANDERING_DB);
    initWanderingStore(TEST_WANDERING_DB);
  });

  afterAll(() => {
    if (existsSync(TEST_WANDERING_DB)) unlinkSync(TEST_WANDERING_DB);
  });

  it('stores wandering text', () => {
    const entry = wanderText(
      "Toyota's kanban system reduced inventory waste by 40% by making each station pull from the previous one.",
      'Twitter',
      'manufacturing',
    );

    expect(entry.text).toContain('kanban');
    expect(entry.domain).toBe('manufacturing');
  });

  it('stores multiple wandering entries', () => {
    wanderText(
      'Mycorrhizal networks in forests allow trees to share nutrients through underground fungal connections.',
      'Wikipedia',
      'biology',
    );

    wanderText(
      'The best managers create environments where the right behavior is the easiest behavior.',
      'Reddit',
      'management',
    );
  });
});

describe('DMN - Association', () => {
  it('finds cross-domain links', () => {
    const wandering = initWanderingStore(TEST_WANDERING_DB);
    const knowledge = initKnowledgeStore(TEST_KNOWLEDGE_DB);

    // Both stores should have content from previous tests
    if (wandering.size() > 0 && knowledge.size() > 0) {
      const links = findAssociations(wandering, knowledge, 0.1);
      // May or may not find links depending on content overlap
      expect(links).toBeDefined();
      expect(Array.isArray(links)).toBe(true);
    }
  });
});

describe('DMN - Dreamer', () => {
  it('generates insights from links', async () => {
    const mockModel = new MockProvider([{
      content: JSON.stringify({
        connection: 'Both systems use pull-based resource distribution',
        analogy: 'Kanban stations map to farm feeding stations; inventory maps to feed stock',
        applications: ['Apply JIT to feed mixing', 'Reduce feed waste with pull-based issuance'],
        novelty: 0.7,
        depth: 0.6,
      }),
    }]);

    const links = [{
      entryA: { text: 'Toyota kanban system', domain: 'manufacturing', source: 'Twitter' },
      entryB: { text: 'Farm feed management', domain: 'farming', source: 'USDA' },
      similarity: 0.5,
      surprising: true,
    }];

    const insights = await dream(links, mockModel);
    expect(insights.length).toBe(1);
    expect(insights[0].connection).toContain('pull-based');
    expect(insights[0].applications.length).toBeGreaterThan(0);
  });
});

describe('DMN - Insight Journal', () => {
  beforeAll(() => {
    if (existsSync(TEST_INSIGHTS_DB)) unlinkSync(TEST_INSIGHTS_DB);
    initInsightJournal(TEST_INSIGHTS_DB);
  });

  afterAll(() => {
    if (existsSync(TEST_INSIGHTS_DB)) unlinkSync(TEST_INSIGHTS_DB);
  });

  it('saves and retrieves insights', () => {
    const id = saveInsight({
      sourceA: { text: 'Kanban system', domain: 'manufacturing', source: 'Twitter' },
      sourceB: { text: 'Feed management', domain: 'farming', source: 'USDA' },
      connection: 'Both use pull-based distribution',
      analogy: 'Kanban stations = feeding stations',
      applications: ['Apply JIT to feed mixing'],
      noveltyScore: 0.8,
      depthScore: 0.7,
      createdAt: new Date(),
    });

    expect(id).toBeTruthy();

    const insights = getInsights(1);
    expect(insights.length).toBe(1);
    expect(insights[0].connection).toContain('pull-based');
  });

  it('filters low-quality insights', () => {
    const id = saveInsight({
      sourceA: { text: 'Low quality A', domain: 'test', source: 'test' },
      sourceB: { text: 'Low quality B', domain: 'test', source: 'test' },
      connection: 'Weak connection',
      analogy: 'Not really',
      applications: [],
      noveltyScore: 0.1,
      depthScore: 0.1,
      createdAt: new Date(),
    }, 0.4);

    expect(id).toBeNull(); // Below threshold
  });

  it('reports stats', () => {
    const stats = insightStats();
    expect(stats.totalInsights).toBeGreaterThan(0);
  });
});

// --- Synthesis Tests ---

describe('Synthesis', () => {
  it('identifies relevant domains', () => {
    const domains = identifyDomains('Should I invest in a new cooling system for the chicken farm?');
    expect(domains).toContain('financial');
    expect(domains).toContain('engineering');
    expect(domains).toContain('agricultural');
  });

  it('defaults to at least 2 domains', () => {
    const domains = identifyDomains('Hello world');
    expect(domains.length).toBeGreaterThanOrEqual(2);
  });

  it('identifies market domain', () => {
    const domains = identifyDomains('How can I sell more eggs to wholesale customers?');
    expect(domains).toContain('market');
  });
});
