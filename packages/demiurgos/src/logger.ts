// ============================================================
// DEMIURGOS — Logger & Cost Tracker (SQLite)
// ============================================================

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { TaskLog, CacheHitType, UserFeedback, FeedbackType } from './types.js';

let db: Database.Database;

export function initLogger(dbPath = 'demiurgos-ops.db'): void {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      result TEXT NOT NULL,
      model_used TEXT NOT NULL,
      tier INTEGER NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      quality_score REAL NOT NULL DEFAULT 0,
      cache_hit TEXT NOT NULL DEFAULT 'miss',
      evidence_confidence REAL NOT NULL DEFAULT 0,
      coherence_confidence REAL NOT NULL DEFAULT 0,
      total_confidence REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      result_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      flagged_claims TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_costs (
      date TEXT PRIMARY KEY,
      total_usd REAL NOT NULL DEFAULT 0,
      task_count INTEGER NOT NULL DEFAULT 0,
      cache_hits INTEGER NOT NULL DEFAULT 0,
      cache_misses INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// --- Task Logging ---

export function logTask(log: Omit<TaskLog, 'id' | 'timestamp'>): string {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO task_logs (id, task_id, prompt, result, model_used, tier, cost_usd,
      input_tokens, output_tokens, quality_score, cache_hit,
      evidence_confidence, coherence_confidence, total_confidence, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, log.taskId, log.prompt, log.result, log.modelUsed, log.tier,
    log.costUsd, log.inputTokens, log.outputTokens, log.qualityScore,
    log.cacheHit, log.evidenceConfidence, log.coherenceConfidence,
    log.totalConfidence, log.durationMs,
  );

  // Update daily costs
  const today = new Date().toISOString().split('T')[0];
  const isHit = log.cacheHit !== 'miss';
  db.prepare(`
    INSERT INTO daily_costs (date, total_usd, task_count, cache_hits, cache_misses)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_usd = total_usd + ?,
      task_count = task_count + 1,
      cache_hits = cache_hits + ?,
      cache_misses = cache_misses + ?
  `).run(today, log.costUsd, isHit ? 1 : 0, isHit ? 0 : 1,
         log.costUsd, isHit ? 1 : 0, isHit ? 0 : 1);

  return id;
}

// --- Feedback ---

export function logFeedback(taskId: string, resultId: string, type: FeedbackType, reason?: string): void {
  db.prepare(`
    INSERT INTO feedback (id, task_id, result_id, type, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), taskId, resultId, type, reason ?? null);
}

// --- Cost Reports ---

export interface CostSummary {
  today: { totalUsd: number; taskCount: number; cacheHitRate: number };
  thisWeek: { totalUsd: number; taskCount: number; cacheHitRate: number };
  thisMonth: { totalUsd: number; taskCount: number; cacheHitRate: number };
  allTime: { totalUsd: number; taskCount: number; cacheHitRate: number };
  byModel: { model: string; totalUsd: number; taskCount: number }[];
  byTier: { tier: number; totalUsd: number; taskCount: number }[];
}

export function getCostSummary(): CostSummary {
  const today = new Date().toISOString().split('T')[0];

  const todayRow = db.prepare(
    'SELECT total_usd, task_count, cache_hits, cache_misses FROM daily_costs WHERE date = ?'
  ).get(today) as { total_usd: number; task_count: number; cache_hits: number; cache_misses: number } | undefined;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekRow = db.prepare(
    'SELECT SUM(total_usd) as total_usd, SUM(task_count) as task_count, SUM(cache_hits) as cache_hits, SUM(cache_misses) as cache_misses FROM daily_costs WHERE date >= ?'
  ).get(weekAgo) as { total_usd: number; task_count: number; cache_hits: number; cache_misses: number };

  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const monthRow = db.prepare(
    'SELECT SUM(total_usd) as total_usd, SUM(task_count) as task_count, SUM(cache_hits) as cache_hits, SUM(cache_misses) as cache_misses FROM daily_costs WHERE date >= ?'
  ).get(monthStart) as { total_usd: number; task_count: number; cache_hits: number; cache_misses: number };

  const allRow = db.prepare(
    'SELECT SUM(total_usd) as total_usd, SUM(task_count) as task_count, SUM(cache_hits) as cache_hits, SUM(cache_misses) as cache_misses FROM daily_costs'
  ).get() as { total_usd: number; task_count: number; cache_hits: number; cache_misses: number };

  const byModel = db.prepare(
    'SELECT model_used as model, SUM(cost_usd) as totalUsd, COUNT(*) as taskCount FROM task_logs GROUP BY model_used ORDER BY totalUsd DESC'
  ).all() as { model: string; totalUsd: number; taskCount: number }[];

  const byTier = db.prepare(
    'SELECT tier, SUM(cost_usd) as totalUsd, COUNT(*) as taskCount FROM task_logs GROUP BY tier ORDER BY tier'
  ).all() as { tier: number; totalUsd: number; taskCount: number }[];

  const hitRate = (hits: number, misses: number) =>
    hits + misses > 0 ? hits / (hits + misses) : 0;

  return {
    today: {
      totalUsd: todayRow?.total_usd ?? 0,
      taskCount: todayRow?.task_count ?? 0,
      cacheHitRate: todayRow ? hitRate(todayRow.cache_hits, todayRow.cache_misses) : 0,
    },
    thisWeek: {
      totalUsd: weekRow?.total_usd ?? 0,
      taskCount: weekRow?.task_count ?? 0,
      cacheHitRate: hitRate(weekRow?.cache_hits ?? 0, weekRow?.cache_misses ?? 0),
    },
    thisMonth: {
      totalUsd: monthRow?.total_usd ?? 0,
      taskCount: monthRow?.task_count ?? 0,
      cacheHitRate: hitRate(monthRow?.cache_hits ?? 0, monthRow?.cache_misses ?? 0),
    },
    allTime: {
      totalUsd: allRow?.total_usd ?? 0,
      taskCount: allRow?.task_count ?? 0,
      cacheHitRate: hitRate(allRow?.cache_hits ?? 0, allRow?.cache_misses ?? 0),
    },
    byModel,
    byTier,
  };
}

// --- Recent Tasks ---

export function getRecentTasks(limit = 10): TaskLog[] {
  return db.prepare(
    'SELECT * FROM task_logs ORDER BY timestamp DESC LIMIT ?'
  ).all(limit) as TaskLog[];
}

export function getDb(): Database.Database {
  return db;
}
