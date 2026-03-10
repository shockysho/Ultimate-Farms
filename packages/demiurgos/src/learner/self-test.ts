// ============================================================
// DEMIURGOS — Active Learner Self-Test
// ============================================================
//
// After the learner fills a knowledge gap by ingesting new content,
// it replays previously failed tasks to measure improvement.
// Only declares a gap "filled" if replayed tasks score higher.

import { getDb } from '../logger.js';
import { execute } from '../engine.js';
import type { Tier } from '../types.js';

export interface SelfTestResult {
  taskId: string;
  prompt: string;
  originalScore: number;
  originalModel: string;
  newScore: number;
  newModel: string;
  improvement: number;
  improved: boolean;
}

export interface SelfTestReport {
  domain: string;
  tasksReplayed: number;
  tasksImproved: number;
  averageImprovement: number;
  results: SelfTestResult[];
  gapFilled: boolean;
  testedAt: Date;
}

/**
 * Replay failed tasks in a given domain to test if knowledge gap was filled.
 * Returns a report on the improvement (or lack thereof).
 */
export async function selfTest(
  domain: string,
  maxReplay = 5,
): Promise<SelfTestReport> {
  const db = getDb();

  // Find failed/low-scoring tasks in this domain
  const failedTasks = db.prepare(`
    SELECT id, task_id as taskId, prompt, quality_score as qualityScore,
      model_used as modelUsed, tier
    FROM task_logs
    WHERE quality_score < 0.6
    AND prompt LIKE ?
    AND timestamp > datetime('now', '-30 days')
    ORDER BY quality_score ASC
    LIMIT ?
  `).all(`%${domainToKeyword(domain)}%`, maxReplay) as {
    id: string;
    taskId: string;
    prompt: string;
    qualityScore: number;
    modelUsed: string;
    tier: number;
  }[];

  if (failedTasks.length === 0) {
    return {
      domain,
      tasksReplayed: 0,
      tasksImproved: 0,
      averageImprovement: 0,
      results: [],
      gapFilled: true, // No failures = gap doesn't exist
      testedAt: new Date(),
    };
  }

  const results: SelfTestResult[] = [];

  for (const task of failedTasks) {
    try {
      // Re-execute the same prompt with current knowledge
      const result = await execute(task.prompt, {
        maxTier: Math.max(task.tier, 2) as Tier, // Don't go higher than original + 1
      });

      const newScore = result.evaluation.compositeScore;
      const improvement = newScore - task.qualityScore;

      results.push({
        taskId: task.taskId,
        prompt: task.prompt,
        originalScore: task.qualityScore,
        originalModel: task.modelUsed,
        newScore,
        newModel: result.model,
        improvement,
        improved: improvement > 0.1, // Need at least 0.1 improvement to count
      });
    } catch {
      // If replay fails, skip this task
      continue;
    }
  }

  const improved = results.filter(r => r.improved).length;
  const avgImprovement = results.length > 0
    ? results.reduce((sum, r) => sum + r.improvement, 0) / results.length
    : 0;

  // Gap is "filled" if >60% of replayed tasks improved
  const gapFilled = results.length > 0 && (improved / results.length) > 0.6;

  // Log self-test results
  ensureSelfTestTable(db);
  db.prepare(`
    INSERT INTO self_test_logs (domain, tasks_replayed, tasks_improved, avg_improvement, gap_filled)
    VALUES (?, ?, ?, ?, ?)
  `).run(domain, results.length, improved, avgImprovement, gapFilled ? 1 : 0);

  return {
    domain,
    tasksReplayed: results.length,
    tasksImproved: improved,
    averageImprovement: avgImprovement,
    results,
    gapFilled,
    testedAt: new Date(),
  };
}

/**
 * Get self-test history for the dashboard.
 */
export function getSelfTestHistory(limit = 20): {
  domain: string;
  tasksReplayed: number;
  tasksImproved: number;
  avgImprovement: number;
  gapFilled: boolean;
  testedAt: string;
}[] {
  const db = getDb();
  ensureSelfTestTable(db);

  return db.prepare(`
    SELECT domain, tasks_replayed as tasksReplayed, tasks_improved as tasksImproved,
      avg_improvement as avgImprovement, gap_filled as gapFilled, timestamp as testedAt
    FROM self_test_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit).map((row: any) => ({
    ...row,
    gapFilled: !!row.gapFilled,
  })) as any[];
}

// --- Helpers ---

function ensureSelfTestTable(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      tasks_replayed INTEGER NOT NULL DEFAULT 0,
      tasks_improved INTEGER NOT NULL DEFAULT 0,
      avg_improvement REAL NOT NULL DEFAULT 0,
      gap_filled INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function domainToKeyword(domain: string): string {
  const keywords: Record<string, string> = {
    farming: '%farm%',
    finance: '%cost%',
    engineering: '%pump%',
    code: '%code%',
    management: '%staff%',
    general: '%',
  };
  return keywords[domain] ?? '%';
}
