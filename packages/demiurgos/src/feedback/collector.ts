// ============================================================
// DEMIURGOS — Feedback Collector
// Stores user feedback in SQLite and provides summary analytics.
// ============================================================

import { randomUUID } from 'node:crypto';
import { getDb } from '../logger.js';
import type { FeedbackType } from '../types.js';

// --- Schema Migration ---

export function initFeedbackTables(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_extended (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT,
      dimension_affected TEXT,
      task_type TEXT,
      domain TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibrated_thresholds (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      domain TEXT NOT NULL,
      accuracy REAL NOT NULL,
      completeness REAL NOT NULL,
      relevance REAL NOT NULL,
      actionability REAL NOT NULL,
      specificity REAL NOT NULL,
      weights_json TEXT NOT NULL,
      calibrated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibration_runs (
      id TEXT PRIMARY KEY,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      feedback_count INTEGER NOT NULL DEFAULT 0,
      adjustments_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
}

// --- Record Feedback ---

export function recordFeedback(
  taskId: string,
  verdict: FeedbackType,
  reason?: string,
  dimensionAffected?: string,
  taskType?: string,
  domain?: string,
): string {
  const db = getDb();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO feedback_extended (id, task_id, verdict, reason, dimension_affected, task_type, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, verdict, reason ?? null, dimensionAffected ?? null, taskType ?? null, domain ?? null);

  return id;
}

// --- Feedback Summary ---

export interface FeedbackSummary {
  total: number;
  accepted: number;
  rejected: number;
  flagged: number;
  acceptanceRate: number;
  rejectionReasons: { reason: string; count: number }[];
  byDimension: { dimension: string; count: number }[];
  byTaskType: { taskType: string; accepted: number; rejected: number; flagged: number }[];
  byDomain: { domain: string; accepted: number; rejected: number; flagged: number }[];
}

export function getFeedbackSummary(): FeedbackSummary {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as count FROM feedback_extended').get() as { count: number }).count;
  const accepted = (db.prepare("SELECT COUNT(*) as count FROM feedback_extended WHERE verdict = 'accept'").get() as { count: number }).count;
  const rejected = (db.prepare("SELECT COUNT(*) as count FROM feedback_extended WHERE verdict = 'reject'").get() as { count: number }).count;
  const flagged = (db.prepare("SELECT COUNT(*) as count FROM feedback_extended WHERE verdict = 'flag'").get() as { count: number }).count;

  const acceptanceRate = total > 0 ? accepted / total : 0;

  const rejectionReasons = db.prepare(`
    SELECT reason, COUNT(*) as count
    FROM feedback_extended
    WHERE verdict IN ('reject', 'flag') AND reason IS NOT NULL AND reason != ''
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 20
  `).all() as { reason: string; count: number }[];

  const byDimension = db.prepare(`
    SELECT dimension_affected as dimension, COUNT(*) as count
    FROM feedback_extended
    WHERE dimension_affected IS NOT NULL AND dimension_affected != ''
    GROUP BY dimension_affected
    ORDER BY count DESC
  `).all() as { dimension: string; count: number }[];

  const byTaskType = db.prepare(`
    SELECT
      task_type as taskType,
      SUM(CASE WHEN verdict = 'accept' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN verdict = 'reject' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN verdict = 'flag' THEN 1 ELSE 0 END) as flagged
    FROM feedback_extended
    WHERE task_type IS NOT NULL
    GROUP BY task_type
  `).all() as { taskType: string; accepted: number; rejected: number; flagged: number }[];

  const byDomain = db.prepare(`
    SELECT
      domain,
      SUM(CASE WHEN verdict = 'accept' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN verdict = 'reject' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN verdict = 'flag' THEN 1 ELSE 0 END) as flagged
    FROM feedback_extended
    WHERE domain IS NOT NULL
    GROUP BY domain
  `).all() as { domain: string; accepted: number; rejected: number; flagged: number }[];

  return {
    total,
    accepted,
    rejected,
    flagged,
    acceptanceRate,
    rejectionReasons,
    byDimension,
    byTaskType,
    byDomain,
  };
}

// --- Feedback for Calibration ---

export interface FeedbackRecord {
  id: string;
  taskId: string;
  verdict: FeedbackType;
  reason: string | null;
  dimensionAffected: string | null;
  taskType: string | null;
  domain: string | null;
  timestamp: string;
}

export function getFeedbackForCalibration(
  taskType?: string,
  domain?: string,
  since?: string,
): FeedbackRecord[] {
  const db = getDb();

  let sql = 'SELECT id, task_id as taskId, verdict, reason, dimension_affected as dimensionAffected, task_type as taskType, domain, timestamp FROM feedback_extended WHERE 1=1';
  const params: (string | undefined)[] = [];

  if (taskType) {
    sql += ' AND task_type = ?';
    params.push(taskType);
  }
  if (domain) {
    sql += ' AND domain = ?';
    params.push(domain);
  }
  if (since) {
    sql += ' AND timestamp >= ?';
    params.push(since);
  }

  sql += ' ORDER BY timestamp DESC';

  return db.prepare(sql).all(...params) as FeedbackRecord[];
}

// --- Get last calibration timestamp ---

export function getLastCalibrationTime(): string | null {
  const db = getDb();
  const row = db.prepare('SELECT run_at FROM calibration_runs ORDER BY run_at DESC LIMIT 1').get() as { run_at: string } | undefined;
  return row?.run_at ?? null;
}
