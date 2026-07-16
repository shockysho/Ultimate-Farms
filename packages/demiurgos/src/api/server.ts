// ============================================================
// DEMIURGOS — REST API Server
// ============================================================
//
// External systems call Demiurgos via these endpoints.
// Includes API key auth, rate limiting, budget enforcement, and webhooks.

import express from 'express';
import { env } from '../config.js';
import { execute } from '../engine.js';
import { getCostSummary, getRecentTasks, logFeedback } from '../logger.js';
import { knowledgeStats, ingestText, searchKnowledge } from '../knowledge/ingestor.js';
import { ingestWebPage } from '../knowledge/sources/web.js';
import { getInsights, searchInsights, insightStats } from '../dmn/insight-journal.js';
import { getLearnerState, runLearningCycle } from '../learner/scheduler.js';
import { getSelfTestHistory } from '../learner/self-test.js';
import { getDMNState, runDMNCycle } from '../dmn/scheduler.js';
import { getSourceDomains, getSourceCount } from '../dmn/sources.js';
import { checkAvailability, selectModel } from '../router.js';
import type { Tier, FeedbackType } from '../types.js';

// --- Webhook Registry ---

interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  createdAt: Date;
}

const webhooks: WebhookRegistration[] = [];

async function fireWebhook(event: string, data: unknown): Promise<void> {
  const matching = webhooks.filter(w => w.events.includes(event) || w.events.includes('*'));
  for (const webhook of matching) {
    try {
      await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* webhook delivery failed — silently ignore */ }
  }
}

// --- Rate Limiter ---

const rateLimitWindow = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = parseInt(process.env.API_RATE_LIMIT ?? '100', 10);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitWindow.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitWindow.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// --- Budget Check ---

function checkBudget(): { allowed: boolean; reason?: string; dailySpent: number; monthlySpent: number } {
  const costs = getCostSummary();
  const dailySpent = costs.today.totalUsd;
  const monthlySpent = costs.thisMonth.totalUsd;
  if (dailySpent >= env.dailyBudgetUsd) {
    return { allowed: false, reason: `Daily budget exceeded: $${dailySpent.toFixed(2)} / $${env.dailyBudgetUsd.toFixed(2)}`, dailySpent, monthlySpent };
  }
  if (monthlySpent >= env.monthlyBudgetUsd) {
    return { allowed: false, reason: `Monthly budget exceeded: $${monthlySpent.toFixed(2)} / $${env.monthlyBudgetUsd.toFixed(2)}`, dailySpent, monthlySpent };
  }
  return { allowed: true, dailySpent, monthlySpent };
}

export function startAPIServer(port?: number): void {
  const app = express();
  const apiPort = port ?? env.apiPort;
  const apiKey = process.env.DEMIURGOS_API_KEY;

  app.use(express.json({ limit: '10mb' }));

  // --- CORS ---
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
  });

  // --- Auth + Rate Limit Middleware ---
  app.use((req, res, next) => {
    if (req.path === '/health' || req.method === 'OPTIONS') return next();
    if (apiKey && req.headers['x-api-key'] !== apiKey) {
      res.status(401).json({ error: 'Invalid or missing API key' });
      return;
    }
    const ip = req.ip ?? 'unknown';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
      return;
    }
    next();
  });

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

  // --- Task by ID ---

  app.get('/task/:id', (req, res) => {
    const tasks = getRecentTasks(200);
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  });

  // --- Knowledge: Ingest from URL ---

  app.post('/knowledge/ingest/url', async (req, res) => {
    try {
      const { url, domain } = req.body;
      if (!url || !domain) { res.status(400).json({ error: 'Missing: url, domain' }); return; }
      const result = await ingestWebPage(url, domain);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to ingest URL' });
    }
  });

  // --- Budget ---

  app.get('/costs/budget', (_req, res) => {
    const budget = checkBudget();
    res.json({ ...budget, dailyLimit: env.dailyBudgetUsd, monthlyLimit: env.monthlyBudgetUsd });
  });

  // --- DMN ---

  app.post('/dmn/dream', async (_req, res) => {
    try {
      const selection = selectModel(1 as Tier, { type: 'creative' } as any);
      if (!selection) { res.status(503).json({ error: 'No model available for DMN' }); return; }
      const insights = await runDMNCycle(selection.provider);
      res.json({ insightsGenerated: insights.length, insights });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'DMN cycle failed' });
    }
  });

  app.get('/dmn/sources', (_req, res) => {
    res.json({ domains: getSourceDomains(), totalSources: getSourceCount() });
  });

  app.get('/dmn/state', (_req, res) => { res.json(getDMNState()); });

  // --- Learner ---

  app.get('/learner/state', (_req, res) => { res.json(getLearnerState()); });

  app.post('/learner/run', async (_req, res) => {
    try {
      const result = await runLearningCycle();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/learner/self-tests', (req, res) => {
    const limit = parseInt(req.query.limit as string ?? '20', 10);
    res.json(getSelfTestHistory(limit));
  });

  // --- Webhooks ---

  app.post('/webhooks', (req, res) => {
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      res.status(400).json({ error: 'Missing: url, events (array)' }); return;
    }
    const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    webhooks.push({ id, url, events, createdAt: new Date() });
    res.json({ id, url, events });
  });

  app.get('/webhooks', (_req, res) => { res.json(webhooks); });

  app.delete('/webhooks/:id', (req, res) => {
    const idx = webhooks.findIndex(w => w.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'Webhook not found' }); return; }
    webhooks.splice(idx, 1);
    res.json({ success: true });
  });

  // --- Config ---

  app.get('/config', (_req, res) => {
    res.json({
      dailyBudgetUsd: env.dailyBudgetUsd, monthlyBudgetUsd: env.monthlyBudgetUsd,
      minEvaluatorConfidence: env.minEvaluatorConfidence,
      cacheExactThreshold: env.cacheExactThreshold, cacheAdaptThreshold: env.cacheAdaptThreshold,
      dashboardPort: env.dashboardPort, apiPort: env.apiPort,
    });
  });

  // --- System ---

  app.get('/health', async (_req, res) => {
    const availability = await checkAvailability();
    const budget = checkBudget();
    res.json({
      status: 'online',
      uptime: process.uptime(),
      models: availability,
      learner: getLearnerState(),
      dmn: getDMNState(),
      budget: { dailySpent: budget.dailySpent, monthlySpent: budget.monthlySpent,
        dailyLimit: env.dailyBudgetUsd, monthlyLimit: env.monthlyBudgetUsd, allowed: budget.allowed },
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(apiPort, () => {
    console.log(`[api] REST API running at http://localhost:${apiPort}`);
  });
}
