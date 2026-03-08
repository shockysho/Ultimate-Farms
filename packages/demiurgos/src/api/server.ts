// ============================================================
// DEMIURGOS — REST API Server
// ============================================================
//
// External systems call Demiurgos via these endpoints.

import express from 'express';
import { env } from '../config.js';
import { execute } from '../engine.js';
import { getCostSummary, getRecentTasks, logFeedback } from '../logger.js';
import { knowledgeStats, ingestText, searchKnowledge } from '../knowledge/ingestor.js';
import { getInsights, searchInsights, insightStats } from '../dmn/insight-journal.js';
import { getLearnerState, runLearningCycle } from '../learner/scheduler.js';
import { getDMNState } from '../dmn/scheduler.js';
import { checkAvailability } from '../router.js';
import type { Tier, FeedbackType } from '../types.js';

export function startAPIServer(port?: number): void {
  const app = express();
  const apiPort = port ?? env.apiPort;

  app.use(express.json());

  // --- Task Execution ---

  app.post('/task', async (req, res) => {
    try {
      const { prompt, maxBudget, maxTier, context } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing required field: prompt' });
        return;
      }

      const result = await execute(prompt, {
        maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
        maxTier: maxTier ? parseInt(maxTier, 10) as Tier : undefined,
        context,
      });

      res.json({
        id: result.id,
        content: result.content,
        model: result.model,
        tier: result.tier,
        cost: result.cost,
        evaluation: {
          compositeScore: result.evaluation.compositeScore,
          totalConfidence: result.evaluation.totalConfidence,
          verdict: result.evaluation.verdict,
        },
        cached: result.cached,
        duration: result.duration,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // --- Feedback ---

  app.post('/feedback', (req, res) => {
    const { taskId, resultId, type, reason } = req.body;
    if (!taskId || !resultId || !type) {
      res.status(400).json({ error: 'Missing required fields: taskId, resultId, type' });
      return;
    }
    logFeedback(taskId, resultId, type as FeedbackType, reason);
    res.json({ success: true });
  });

  // --- Cost & Stats ---

  app.get('/costs', (_req, res) => {
    res.json(getCostSummary());
  });

  app.get('/tasks', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '20', 10);
    res.json(getRecentTasks(limit));
  });

  // --- Knowledge ---

  app.post('/knowledge/ingest', (req, res) => {
    const { text, source, domain } = req.body;
    if (!text || !source || !domain) {
      res.status(400).json({ error: 'Missing required fields: text, source, domain' });
      return;
    }
    const result = ingestText(text, source, domain);
    res.json(result);
  });

  app.get('/knowledge/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Missing query parameter: q' });
      return;
    }
    const results = searchKnowledge(query);
    res.json(results);
  });

  app.get('/knowledge/stats', (_req, res) => {
    res.json(knowledgeStats());
  });

  // --- Insights ---

  app.get('/insights', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '10', 10);
    res.json(getInsights(limit));
  });

  app.get('/insights/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'Missing query parameter: q' });
      return;
    }
    res.json(searchInsights(query));
  });

  app.get('/insights/stats', (_req, res) => {
    res.json(insightStats());
  });

  // --- System ---

  app.get('/health', async (_req, res) => {
    const availability = await checkAvailability();
    res.json({
      status: 'online',
      uptime: process.uptime(),
      models: availability,
      learner: getLearnerState(),
      dmn: getDMNState(),
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/learner/run', async (_req, res) => {
    try {
      const result = await runLearningCycle();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.listen(apiPort, () => {
    console.log(`[api] REST API running at http://localhost:${apiPort}`);
  });
}
