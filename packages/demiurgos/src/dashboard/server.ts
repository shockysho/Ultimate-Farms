// ============================================================
// DEMIURGOS — Dashboard Server
// ============================================================
//
// Local web UI for operational visibility.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from '../config.js';
import { getCostSummary, getRecentTasks } from '../logger.js';
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

  app.use(express.static(join(__dirname, 'public')));

  // API endpoints for dashboard data
  app.get('/api/costs', (_req, res) => {
    res.json(getCostSummary());
  });

  app.get('/api/tasks', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '20', 10);
    res.json(getRecentTasks(limit));
  });

  app.get('/api/cache', (_req, res) => {
    const cache = getCache();
    res.json(cache ? cache.stats() : { totalEntries: 0 });
  });

  app.get('/api/knowledge', (_req, res) => {
    res.json(knowledgeStats());
  });

  app.get('/api/learner', (_req, res) => {
    res.json(getLearnerState());
  });

  app.get('/api/dmn', (_req, res) => {
    res.json(getDMNState());
  });

  app.get('/api/insights', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '10', 10);
    res.json(getInsights(limit));
  });

  app.get('/api/insight-stats', (_req, res) => {
    res.json(insightStats());
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(dashPort, () => {
    console.log(`[dashboard] Running at http://localhost:${dashPort}`);
  });
}
