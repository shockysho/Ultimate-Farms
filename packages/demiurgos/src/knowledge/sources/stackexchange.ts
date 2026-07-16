// ============================================================
// DEMIURGOS — StackExchange Source Ingestor
// ============================================================
//
// Fetches and ingests Q&A content from StackExchange sites.
// Supports Stack Overflow, Agriculture/Sustainability SE, etc.

import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

const SE_API_BASE = 'https://api.stackexchange.com/2.3';

/** Supported StackExchange site identifiers. */
const SUPPORTED_SITES: Record<string, string> = {
  stackoverflow: 'stackoverflow',
  agriculture: 'sustainability',  // sustainability.stackexchange.com covers agriculture
};

interface SEQuestion {
  question_id: number;
  title: string;
  body: string;
  score: number;
  tags: string[];
  link: string;
  answer_count: number;
}

interface SEAnswer {
  answer_id: number;
  body: string;
  score: number;
  is_accepted: boolean;
  question_id: number;
}

/**
 * Search StackExchange and ingest top Q&A results.
 *
 * Fetches the top questions by vote count, then retrieves
 * their top 5 answers. Strips HTML and ingests with vote
 * count as quality metadata.
 */
export async function ingestStackExchange(
  query: string,
  site: string,
  domain: string,
): Promise<IngestResult> {
  const siteKey = SUPPORTED_SITES[site] ?? site;

  // Search for questions
  const questions = await searchQuestions(query, siteKey);

  if (questions.length === 0) {
    throw new Error(
      `No StackExchange results found for "${query}" on ${site}. ` +
      `Supported sites: ${Object.keys(SUPPORTED_SITES).join(', ')}`,
    );
  }

  // Fetch answers for top questions
  const questionIds = questions.slice(0, 5).map(q => q.question_id);
  const answers = await fetchAnswers(questionIds, siteKey);

  // Build ingestible text from questions + answers
  const textParts: string[] = [];

  for (const question of questions.slice(0, 5)) {
    const qText = stripHtmlTags(question.body);
    const qAnswers = answers
      .filter(a => a.question_id === question.question_id)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    let section = `QUESTION (score: ${question.score}): ${question.title}\n\n${qText}`;

    for (const answer of qAnswers) {
      const aText = stripHtmlTags(answer.body);
      const accepted = answer.is_accepted ? ' [ACCEPTED]' : '';
      section += `\n\nANSWER (score: ${answer.score}${accepted}):\n${aText}`;
    }

    section += `\n\nSource: ${question.link}`;
    section += `\nTags: ${question.tags.join(', ')}`;
    textParts.push(section);
  }

  const fullText = textParts.join('\n\n---\n\n');
  const sourceLabel = `stackexchange:${siteKey}:search:"${query}"`;

  return ingestText(fullText, sourceLabel, domain, {
    chunkSize: 600,
    overlap: 100,
  });
}

// --- API Helpers ---

async function searchQuestions(query: string, site: string): Promise<SEQuestion[]> {
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'votes',
    q: query,
    site,
    filter: 'withbody',
    pagesize: '5',
  });

  const url = `${SE_API_BASE}/search/advanced?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`StackExchange API error: ${response.status}`);
  }

  const data = await response.json() as { items: SEQuestion[] };
  return data.items ?? [];
}

async function fetchAnswers(questionIds: number[], site: string): Promise<SEAnswer[]> {
  if (questionIds.length === 0) return [];

  const ids = questionIds.join(';');
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'votes',
    site,
    filter: 'withbody',
    pagesize: '25',
  });

  const url = `${SE_API_BASE}/questions/${ids}/answers?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`StackExchange API error: ${response.status}`);
  }

  const data = await response.json() as { items: SEAnswer[] };
  return data.items ?? [];
}

/**
 * Strip HTML tags from StackExchange answer/question bodies.
 * Preserves code blocks as plain text.
 */
function stripHtmlTags(html: string): string {
  let text = html;

  // Convert code blocks to indented text
  text = text.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, '\n\n$1\n\n');
  text = text.replace(/<code>([^<]*)<\/code>/gi, '`$1`');

  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre)[^>]*>/gi, '\n');
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}
