// ============================================================
// DEMIURGOS — DMN Insight Journal
// ============================================================
//
// Phase 4: Stores, scores, and surfaces insights.
// The permanent record of the DMN's creative discoveries.

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { DreamInsight } from './dreamer.js';

export interface JournalEntry {
  id: string;
  sourceAText: string;
  sourceADomain: string;
  sourceBText: string;
  sourceBDomain: string;
  connection: string;
  analogy: string;
  applications: string[];
  noveltyScore: number;
  depthScore: number;
  overallScore: number;
  createdAt: Date;
}

let db: Database.Database;

export function initInsightJournal(dbPath = 'demiurgos-insights.db'): void {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      source_a_text TEXT NOT NULL,
      source_a_domain TEXT NOT NULL,
      source_b_text TEXT NOT NULL,
      source_b_domain TEXT NOT NULL,
      connection TEXT NOT NULL,
      analogy TEXT NOT NULL,
      applications TEXT NOT NULL DEFAULT '[]',
      novelty_score REAL NOT NULL DEFAULT 0,
      depth_score REAL NOT NULL DEFAULT 0,
      overall_score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Save a dream insight to the journal.
 * Only saves if the overall score is above threshold.
 */
export function saveInsight(insight: DreamInsight, minScore = 0.4): string | null {
  const overallScore = (insight.noveltyScore * 0.5 + insight.depthScore * 0.5);

  if (overallScore < minScore) return null;

  const id = randomUUID();

  db.prepare(`
    INSERT INTO insights (id, source_a_text, source_a_domain, source_b_text, source_b_domain,
      connection, analogy, applications, novelty_score, depth_score, overall_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    insight.sourceA.text.slice(0, 500),
    insight.sourceA.domain,
    insight.sourceB.text.slice(0, 500),
    insight.sourceB.domain,
    insight.connection,
    insight.analogy,
    JSON.stringify(insight.applications),
    insight.noveltyScore,
    insight.depthScore,
    overallScore,
  );

  return id;
}

/**
 * Get recent insights, sorted by score.
 */
export function getInsights(limit = 10): JournalEntry[] {
  return db.prepare(`
    SELECT id,
      source_a_text as sourceAText, source_a_domain as sourceADomain,
      source_b_text as sourceBText, source_b_domain as sourceBDomain,
      connection, analogy, applications,
      novelty_score as noveltyScore, depth_score as depthScore,
      overall_score as overallScore, created_at as createdAt
    FROM insights
    ORDER BY overall_score DESC, created_at DESC
    LIMIT ?
  `).all(limit).map((row: any) => ({
    ...row,
    applications: JSON.parse(row.applications),
    createdAt: new Date(row.createdAt),
  })) as JournalEntry[];
}

/**
 * Search insights by topic (keyword match).
 */
export function searchInsights(query: string, limit = 5): JournalEntry[] {
  return db.prepare(`
    SELECT id,
      source_a_text as sourceAText, source_a_domain as sourceADomain,
      source_b_text as sourceBText, source_b_domain as sourceBDomain,
      connection, analogy, applications,
      novelty_score as noveltyScore, depth_score as depthScore,
      overall_score as overallScore, created_at as createdAt
    FROM insights
    WHERE connection LIKE ? OR analogy LIKE ? OR source_a_text LIKE ? OR source_b_text LIKE ?
    ORDER BY overall_score DESC
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit).map((row: any) => ({
    ...row,
    applications: JSON.parse(row.applications),
    createdAt: new Date(row.createdAt),
  })) as JournalEntry[];
}

/**
 * Get insight journal statistics.
 */
export function insightStats(): {
  totalInsights: number;
  avgScore: number;
  topDomainPairs: { domains: string; count: number }[];
} {
  const total = (db.prepare('SELECT COUNT(*) as count FROM insights').get() as { count: number }).count;
  const avg = (db.prepare('SELECT AVG(overall_score) as avg FROM insights').get() as { avg: number | null }).avg ?? 0;

  const pairs = db.prepare(`
    SELECT source_a_domain || ' ↔ ' || source_b_domain as domains, COUNT(*) as count
    FROM insights
    GROUP BY domains
    ORDER BY count DESC
    LIMIT 5
  `).all() as { domains: string; count: number }[];

  return { totalInsights: total, avgScore: avg, topDomainPairs: pairs };
}
