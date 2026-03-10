// ============================================================
// DEMIURGOS — Dashboard Server
// ============================================================
//
// Local web UI for operational visibility.
// Serves the dashboard static files and API endpoints that
// query the SQLite databases for live metrics.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from '../config.js';
import { getCostSummary, getRecentTasks, getDb } from '../logger.js';
import { knowledgeStats } from '../knowledge/ingestor.js';
import { getLearnerState } from '../learner/scheduler.js';
import { getDMNState } from '../dmn/scheduler.js';
import { insightStats, getInsights } from '../dmn/insight-journal.js';
import { getCache } from '../engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startDashboard(port?: number): void {
  const app = express();
  const dashPort = port ?? env.dashboardPort;

  // Serve static files from the public directory
  app.use('/dashboard', express.static(join(__dirname, 'public')));

  // Also serve at root for backwards compat
  app.use(express.static(join(__dirname, 'public')));

  // ── Cost endpoints ──────────────────────────────────────────

  app.get('/dashboard/api/costs', (_req, res) => {
    try {
      res.json(getCostSummary());
    } catch {
      res.json({
        today: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        thisWeek: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        thisMonth: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        allTime: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        byModel: [],
        byTier: [],
      });
    }
  });

  // Legacy route
  app.get('/api/costs', (_req, res) => {
    try {
      res.json(getCostSummary());
    } catch {
      res.json({
        today: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        thisWeek: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        thisMonth: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        allTime: { totalUsd: 0, taskCount: 0, cacheHitRate: 0 },
        byModel: [],
        byTier: [],
      });
    }
  });

  // ── Cache endpoints ─────────────────────────────────────────

  app.get('/dashboard/api/cache', (_req, res) => {
    try {
      const cache = getCache();
      const db = getDb();
      const cacheEntries = cache ? cache.stats().totalEntries : 0;

      // Aggregate hit/miss/adapt counts from task_logs
      const row = db.prepare(`
        SELECT
          COUNT(CASE WHEN cache_hit = 'exact' THEN 1 END) as exactHits,
          COUNT(CASE WHEN cache_hit = 'adapt' THEN 1 END) as adaptHits,
          COUNT(CASE WHEN cache_hit = 'miss' THEN 1 END) as misses,
          COUNT(*) as total,
          SUM(CASE WHEN cache_hit != 'miss' THEN cost_usd ELSE 0 END) as savingsEstimate
        FROM task_logs
      `).get() as { exactHits: number; adaptHits: number; misses: number; total: number; savingsEstimate: number } | undefined;

      const exactHits = row?.exactHits ?? 0;
      const adaptHits = row?.adaptHits ?? 0;
      const misses = row?.misses ?? 0;
      const total = row?.total ?? 0;
      const hitRate = total > 0 ? ((exactHits + adaptHits) / total) * 100 : 0;

      res.json({
        hitRate,
        exactHits,
        adaptHits,
        misses,
        totalEntries: cacheEntries,
        totalRequests: total,
        savingsEstimate: row?.savingsEstimate ?? 0,
      });
    } catch {
      res.json({
        hitRate: 0,
        exactHits: 0,
        adaptHits: 0,
        misses: 0,
        totalEntries: 0,
        totalRequests: 0,
        savingsEstimate: 0,
      });
    }
  });

  app.get('/api/cache', (_req, res) => {
    const cache = getCache();
    res.json(cache ? cache.stats() : { totalEntries: 0 });
  });

  // ── Quality endpoint ────────────────────────────────────────

  app.get('/dashboard/api/quality', (_req, res) => {
    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT
          AVG(quality_score) as avgComposite,
          COUNT(CASE WHEN quality_score < 0.4 THEN 1 END) as failures,
          COUNT(CASE WHEN tier >= 3 THEN 1 END) as escalations,
          COUNT(*) as total,
          AVG(evidence_confidence) as avgEvidence,
          AVG(coherence_confidence) as avgCoherence,
          AVG(total_confidence) as avgConfidence
        FROM task_logs
      `).get() as {
        avgComposite: number | null; failures: number; escalations: number;
        total: number; avgEvidence: number | null; avgCoherence: number | null;
        avgConfidence: number | null;
      } | undefined;

      const total = row?.total ?? 0;
      res.json({
        avgCompositeScore: row?.avgComposite ?? 0,
        failureRate: total > 0 ? (row?.failures ?? 0) / total : 0,
        escalationRate: total > 0 ? (row?.escalations ?? 0) / total : 0,
        totalTasks: total,
        avgEvidenceConfidence: row?.avgEvidence ?? 0,
        avgCoherenceConfidence: row?.avgCoherence ?? 0,
        avgTotalConfidence: row?.avgConfidence ?? 0,
      });
    } catch {
      res.json({
        avgCompositeScore: 0,
        failureRate: 0,
        escalationRate: 0,
        totalTasks: 0,
        avgEvidenceConfidence: 0,
        avgCoherenceConfidence: 0,
        avgTotalConfidence: 0,
      });
    }
  });

  // ── Knowledge endpoint ──────────────────────────────────────

  app.get('/dashboard/api/knowledge', (_req, res) => {
    try {
      const stats = knowledgeStats();
      // Try to get domain breakdown from the knowledge DB if available
      res.json({
        totalChunks: stats.totalChunks,
        // Domain/source breakdowns are not available from the vector store API,
        // so we return what we have.
        byDomain: [],
        bySource: [],
      });
    } catch {
      res.json({ totalChunks: 0, byDomain: [], bySource: [] });
    }
  });

  app.get('/api/knowledge', (_req, res) => {
    try {
      res.json(knowledgeStats());
    } catch {
      res.json({ totalChunks: 0 });
    }
  });

  // ── Learning endpoint ───────────────────────────────────────

  app.get('/dashboard/api/learning', (_req, res) => {
    try {
      const state = getLearnerState();
      const db = getDb();

      // Count tasks with low scores (gaps) and high scores (filled)
      const gapRow = db.prepare(`
        SELECT
          COUNT(CASE WHEN quality_score < 0.6 THEN 1 END) as gapsIdentified,
          COUNT(CASE WHEN quality_score >= 0.8 THEN 1 END) as highQuality,
          AVG(quality_score) as avgScore
        FROM task_logs
      `).get() as { gapsIdentified: number; highQuality: number; avgScore: number | null } | undefined;

      res.json({
        isRunning: state.isRunning,
        lastRun: state.lastRun,
        gapsDetected: state.gapsDetected,
        plansGenerated: state.plansGenerated,
        idleMinutes: state.idleMinutes,
        gapsIdentified: gapRow?.gapsIdentified ?? 0,
        highQualityTasks: gapRow?.highQuality ?? 0,
        avgImprovementScore: gapRow?.avgScore ?? 0,
      });
    } catch {
      res.json({
        isRunning: false,
        lastRun: null,
        gapsDetected: 0,
        plansGenerated: 0,
        idleMinutes: 0,
        gapsIdentified: 0,
        highQualityTasks: 0,
        avgImprovementScore: 0,
      });
    }
  });

  app.get('/api/learner', (_req, res) => {
    try {
      res.json(getLearnerState());
    } catch {
      res.json({ isRunning: false, lastRun: null, gapsDetected: 0, plansGenerated: 0, idleMinutes: 0 });
    }
  });

  // ── Insights endpoint ───────────────────────────────────────

  app.get('/dashboard/api/insights', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string ?? '10', 10);
      const insights = getInsights(limit);
      const stats = insightStats();
      res.json({
        insights,
        stats,
      });
    } catch {
      res.json({
        insights: [],
        stats: { totalInsights: 0, avgScore: 0, topDomainPairs: [] },
      });
    }
  });

  app.get('/api/insights', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string ?? '10', 10);
      res.json(getInsights(limit));
    } catch {
      res.json([]);
    }
  });

  app.get('/api/insight-stats', (_req, res) => {
    try {
      res.json(insightStats());
    } catch {
      res.json({ totalInsights: 0, avgScore: 0, topDomainPairs: [] });
    }
  });

  // ── Tasks endpoint (paginated) ──────────────────────────────

  app.get('/dashboard/api/tasks', (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10)));
      const offset = (page - 1) * limit;
      const db = getDb();

      const countRow = db.prepare('SELECT COUNT(*) as total FROM task_logs').get() as { total: number };
      const total = countRow.total;
      const totalPages = Math.ceil(total / limit);

      const tasks = db.prepare(`
        SELECT id, task_id as taskId, prompt, result,
          model_used as modelUsed, tier, cost_usd as costUsd,
          input_tokens as inputTokens, output_tokens as outputTokens,
          quality_score as qualityScore, cache_hit as cacheHit,
          evidence_confidence as evidenceConfidence,
          coherence_confidence as coherenceConfidence,
          total_confidence as totalConfidence,
          duration_ms as durationMs, timestamp
        FROM task_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `).all(limit, offset);

      res.json({
        tasks,
        pagination: { page, limit, total, totalPages },
      });
    } catch {
      res.json({
        tasks: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    }
  });

  app.get('/api/tasks', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string ?? '20', 10);
      res.json(getRecentTasks(limit));
    } catch {
      res.json([]);
    }
  });

  // ── Feedback endpoint ───────────────────────────────────────

  app.get('/dashboard/api/feedback', (_req, res) => {
    try {
      const db = getDb();

      const row = db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN type = 'accept' THEN 1 END) as accepts,
          COUNT(CASE WHEN type = 'reject' THEN 1 END) as rejects,
          COUNT(CASE WHEN type = 'flag' THEN 1 END) as flags
        FROM feedback
      `).get() as { total: number; accepts: number; rejects: number; flags: number } | undefined;

      const total = row?.total ?? 0;
      const accepts = row?.accepts ?? 0;
      const rejects = row?.rejects ?? 0;
      const flags = row?.flags ?? 0;

      // Get top rejection reasons
      const reasons = db.prepare(`
        SELECT reason, COUNT(*) as count
        FROM feedback
        WHERE type = 'reject' AND reason IS NOT NULL
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 10
      `).all() as { reason: string; count: number }[];

      res.json({
        total,
        acceptanceRate: total > 0 ? accepts / total : 0,
        rejectionRate: total > 0 ? rejects / total : 0,
        flagRate: total > 0 ? flags / total : 0,
        accepts,
        rejects,
        flags,
        topRejectionReasons: reasons,
      });
    } catch {
      res.json({
        total: 0,
        acceptanceRate: 0,
        rejectionRate: 0,
        flagRate: 0,
        accepts: 0,
        rejects: 0,
        flags: 0,
        topRejectionReasons: [],
      });
    }
  });

  // ── Models endpoint ─────────────────────────────────────────

  app.get('/dashboard/api/models', (_req, res) => {
    try {
      const db = getDb();

      const models = db.prepare(`
        SELECT
          model_used as model,
          tier,
          COUNT(*) as taskCount,
          SUM(cost_usd) as totalCost,
          AVG(cost_usd) as avgCost,
          AVG(quality_score) as avgQuality,
          AVG(duration_ms) as avgDuration,
          SUM(input_tokens) as totalInputTokens,
          SUM(output_tokens) as totalOutputTokens
        FROM task_logs
        GROUP BY model_used
        ORDER BY taskCount DESC
      `).all() as {
        model: string; tier: number; taskCount: number; totalCost: number;
        avgCost: number; avgQuality: number; avgDuration: number;
        totalInputTokens: number; totalOutputTokens: number;
      }[];

      const totalTasks = models.reduce((sum, m) => sum + m.taskCount, 0);

      res.json({
        models: models.map(m => ({
          ...m,
          percentage: totalTasks > 0 ? (m.taskCount / totalTasks) * 100 : 0,
        })),
        totalTasks,
      });
    } catch {
      res.json({ models: [], totalTasks: 0 });
    }
  });

  // ── DMN state endpoint ──────────────────────────────────────

  app.get('/api/dmn', (_req, res) => {
    try {
      res.json(getDMNState());
    } catch {
      res.json({ isRunning: false, lastRun: null, totalCycles: 0, totalInsights: 0, idleMinutes: 0 });
    }
  });

  // ── Health endpoint ─────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/dashboard/api/health', (_req, res) => {
    res.json({
      status: 'online',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(dashPort, () => {
    console.log(`[dashboard] Running at http://localhost:${dashPort}`);
    console.log(`[dashboard] Dashboard UI at http://localhost:${dashPort}/dashboard/`);
  });
}
