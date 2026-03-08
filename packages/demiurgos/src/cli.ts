#!/usr/bin/env node
// ============================================================
// DEMIURGOS — CLI Interface
// ============================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { execute, initCache } from './engine.js';
import { initLogger, getCostSummary, getRecentTasks } from './logger.js';
import { checkAvailability, tierName } from './router.js';
import { initKnowledgeStore, ingestText, searchKnowledge, knowledgeStats } from './knowledge/ingestor.js';
import { initInsightJournal, getInsights, insightStats } from './dmn/insight-journal.js';
import { initWanderingStore, wanderText } from './dmn/wanderer.js';
import { runDMNCycle, getDMNState } from './dmn/scheduler.js';
import { runLearningCycle, getLearnerState } from './learner/scheduler.js';
import { synthesize } from './synthesis/synthesizer.js';
import { MockProvider } from './providers/mock.js';
import { startDashboard } from './dashboard/server.js';
import { startAPIServer } from './api/server.js';
import { Tier } from './types.js';

const program = new Command();

function init() {
  initLogger();
  initCache();
  initKnowledgeStore();
  initInsightJournal();
  initWanderingStore();
}

program
  .name('demiurgos')
  .description('Autonomous AI orchestrator — the Gnostic Builder')
  .version('0.1.0');

// --- Ask Command ---
program
  .command('ask')
  .description('Ask Demiurgos anything')
  .argument('<prompt>', 'Your question or task')
  .option('-b, --budget <usd>', 'Maximum budget in USD', '1.0')
  .option('-t, --max-tier <tier>', 'Maximum model tier (1-4)', '4')
  .action(async (prompt: string, opts: { budget: string; maxTier: string }) => {
    init();
    console.log(chalk.blue('\n[Demiurgos] Processing...\n'));

    const result = await execute(prompt, {
      maxBudget: parseFloat(opts.budget),
      maxTier: parseInt(opts.maxTier, 10) as Tier,
    });

    console.log(chalk.green('\n--- Response ---\n'));
    console.log(result.content);
    console.log(chalk.gray('\n--- Meta ---'));
    console.log(chalk.gray(`Model: ${result.model} (${tierName(result.tier)})`));
    console.log(chalk.gray(`Cost: $${result.cost.costUsd.toFixed(4)}`));
    console.log(chalk.gray(`Quality: ${result.evaluation.compositeScore.toFixed(2)}`));
    console.log(chalk.gray(`Evidence: ${result.evaluation.overallEvidenceConfidence.toFixed(2)} | Coherence: ${result.evaluation.coherence.overall.toFixed(2)} | Total: ${result.evaluation.totalConfidence.toFixed(2)}`));
    console.log(chalk.gray(`Duration: ${result.duration}ms | Cached: ${result.cached}`));

    if (result.evaluation.constitutionViolations.length > 0) {
      console.log(chalk.red('\nConstitution violations:'));
      for (const v of result.evaluation.constitutionViolations) {
        console.log(chalk.red(`  - ${v}`));
      }
    }
  });

// --- Cost Command ---
program
  .command('cost')
  .description('Show cost breakdown')
  .action(() => {
    init();
    const summary = getCostSummary();

    console.log(chalk.blue('\n[Demiurgos] Cost Report\n'));

    const sections = [
      { label: 'Today', data: summary.today },
      { label: 'This week', data: summary.thisWeek },
      { label: 'This month', data: summary.thisMonth },
      { label: 'All time', data: summary.allTime },
    ];

    for (const { label, data } of sections) {
      console.log(chalk.white(`${label}:`));
      console.log(`  Spend: $${data.totalUsd.toFixed(4)} | Tasks: ${data.taskCount} | Cache: ${(data.cacheHitRate * 100).toFixed(1)}%`);
    }

    if (summary.byTier.length > 0) {
      console.log(chalk.white('\nBy tier:'));
      for (const t of summary.byTier) {
        console.log(`  ${tierName(t.tier as Tier)}: $${t.totalUsd.toFixed(4)} (${t.taskCount} tasks)`);
      }
    }
  });

// --- Status Command ---
program
  .command('status')
  .description('Check system health')
  .action(async () => {
    init();
    console.log(chalk.blue('\n[Demiurgos] System Status\n'));

    const availability = await checkAvailability();
    for (const [modelId, available] of Object.entries(availability)) {
      const status = available ? chalk.green('ONLINE') : chalk.red('OFFLINE');
      console.log(`  ${modelId}: ${status}`);
    }

    const learner = getLearnerState();
    const dmn = getDMNState();
    const kStats = knowledgeStats();
    const iStats = insightStats();

    console.log(chalk.white('\nSubsystems:'));
    console.log(`  Knowledge: ${kStats.totalChunks} chunks`);
    console.log(`  Learner: ${learner.isRunning ? 'Running' : 'Idle'} (${learner.gapsDetected} gaps detected)`);
    console.log(`  DMN: ${dmn.isRunning ? 'Running' : 'Idle'} (${dmn.totalCycles} cycles, ${dmn.totalInsights} insights)`);
    console.log(`  Insights: ${iStats.totalInsights} total (avg score: ${iStats.avgScore.toFixed(2)})`);
  });

// --- History Command ---
program
  .command('history')
  .description('Show recent task history')
  .option('-n, --limit <count>', 'Number of entries', '10')
  .action((opts: { limit: string }) => {
    init();
    const tasks = getRecentTasks(parseInt(opts.limit, 10));

    console.log(chalk.blue('\n[Demiurgos] Recent Tasks\n'));
    if (tasks.length === 0) {
      console.log(chalk.gray('  No tasks yet.'));
      return;
    }
    for (const t of tasks) {
      const prompt = t.prompt.length > 60 ? t.prompt.slice(0, 60) + '...' : t.prompt;
      console.log(chalk.white(`  ${t.timestamp}`));
      console.log(`    "${prompt}"`);
      console.log(chalk.gray(`    ${t.modelUsed} | $${t.costUsd.toFixed(4)} | Q:${t.qualityScore.toFixed(2)} | C:${t.totalConfidence.toFixed(2)}`));
      console.log();
    }
  });

// --- Insights Command ---
program
  .command('insights')
  .description('Show DMN insight journal')
  .option('-n, --limit <count>', 'Number of entries', '10')
  .action((opts: { limit: string }) => {
    init();
    const insights = getInsights(parseInt(opts.limit, 10));

    console.log(chalk.blue('\n[Demiurgos] Insight Journal\n'));
    if (insights.length === 0) {
      console.log(chalk.gray('  No insights yet. Run "demiurgos dream" to trigger a DMN cycle.'));
      return;
    }
    for (const i of insights) {
      console.log(chalk.magenta(`  ${i.sourceADomain} ↔ ${i.sourceBDomain}`) + chalk.cyan(` [${i.overallScore.toFixed(2)}]`));
      console.log(`    ${i.connection}`);
      console.log(chalk.gray(`    ${i.analogy}`));
      if (i.applications.length > 0) {
        console.log(chalk.gray(`    Applications: ${i.applications.join('; ')}`));
      }
      console.log();
    }
  });

// --- Dream Command ---
program
  .command('dream')
  .description('Trigger a DMN cycle (wander, associate, dream, journal)')
  .action(async () => {
    init();
    console.log(chalk.blue('\n[Demiurgos] Triggering DMN cycle...\n'));
    console.log(chalk.gray('  Note: Requires knowledge base and wandering material.'));
    console.log(chalk.gray('  Use "demiurgos ingest" to add knowledge first.\n'));

    // Use a mock provider for dreaming if no real provider available
    const mock = new MockProvider([{
      content: '{"connection": "Test connection", "analogy": "Test analogy", "applications": ["Test app"], "novelty": 0.5, "depth": 0.5}',
    }]);

    const insights = await runDMNCycle(mock);
    console.log(chalk.green(`  Generated ${insights.length} insights.`));
  });

// --- Learn Command ---
program
  .command('learn')
  .description('Run active learning cycle (detect gaps, plan study)')
  .action(async () => {
    init();
    console.log(chalk.blue('\n[Demiurgos] Running learning cycle...\n'));
    const result = await runLearningCycle();
    console.log(chalk.green(`  Detected ${result.gaps} knowledge gaps.`));
    for (const plan of result.plans) {
      console.log(chalk.yellow(`  [${plan.gap.severity}] ${plan.gap.domain}: ${plan.gap.description}`));
      console.log(chalk.gray(`    Study: ${plan.searchQueries.slice(0, 2).join(', ')}`));
    }
  });

// --- Ingest Command ---
program
  .command('ingest')
  .description('Ingest text into knowledge base')
  .argument('<text>', 'Text to ingest')
  .option('-s, --source <source>', 'Source label', 'manual')
  .option('-d, --domain <domain>', 'Domain', 'general')
  .action((text: string, opts: { source: string; domain: string }) => {
    init();
    const result = ingestText(text, opts.source, opts.domain);
    console.log(chalk.green(`\n[Demiurgos] Ingested ${result.chunksAdded} chunks from "${result.source}" (${result.domain})`));
  });

// --- Search Knowledge Command ---
program
  .command('search')
  .description('Search the knowledge base')
  .argument('<query>', 'Search query')
  .action((query: string) => {
    init();
    const results = searchKnowledge(query);

    console.log(chalk.blue(`\n[Demiurgos] Knowledge search: "${query}"\n`));
    if (results.length === 0) {
      console.log(chalk.gray('  No results found.'));
      return;
    }
    for (const r of results) {
      console.log(chalk.cyan(`  [${r.similarity.toFixed(3)}] ${r.domain} — ${r.source}`));
      console.log(`    ${r.text.slice(0, 150)}...`);
      console.log();
    }
  });

// --- Serve Command ---
program
  .command('serve')
  .description('Start dashboard and API servers')
  .option('-d, --dashboard-port <port>', 'Dashboard port', '3000')
  .option('-a, --api-port <port>', 'API port', '3001')
  .action((opts: { dashboardPort: string; apiPort: string }) => {
    init();
    startDashboard(parseInt(opts.dashboardPort, 10));
    startAPIServer(parseInt(opts.apiPort, 10));
  });

// --- Parse & Execute ---
program.parse();
