#!/usr/bin/env node
// ============================================================
// DEMIURGOS — CLI Interface
// ============================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { execute, initCache } from './engine.js';
import { classifyTaskType, classifyDomain } from './contracts.js';
import { initLogger, getCostSummary, getRecentTasks } from './logger.js';
import { checkAvailability, tierName } from './router.js';
import { initKnowledgeStore, ingestText, searchKnowledge, knowledgeStats } from './knowledge/ingestor.js';
import { ingestYouTube } from './knowledge/sources/youtube.js';
import { ingestWikipediaArticle } from './knowledge/sources/wikipedia.js';
import { ingestUSDADocument, getUSDAPoultryResources } from './knowledge/sources/usda.js';
import { initInsightJournal, getInsights, insightStats } from './dmn/insight-journal.js';
import { initWanderingStore, wanderText } from './dmn/wanderer.js';
import { runDMNCycle, getDMNState } from './dmn/scheduler.js';
import { runLearningCycle, getLearnerState } from './learner/scheduler.js';
import { synthesize } from './synthesis/synthesizer.js';
import { MockProvider } from './providers/mock.js';
import { startDashboard } from './dashboard/server.js';
import { startAPIServer } from './api/server.js';
import { Tier } from './types.js';
import {
  initFeedbackTables, recordFeedback, getFeedbackSummary,
} from './feedback/collector.js';
import { calibrate, getCalibrationHistory } from './feedback/calibrator.js';

const program = new Command();

function init() {
  initLogger();
  initCache();
  initKnowledgeStore();
  initInsightJournal();
  initWanderingStore();
  initFeedbackTables();
}

// --- Readline Helper ---

function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

    // --- Feedback Prompt ---
    const taskType = classifyTaskType(prompt);
    const domain = classifyDomain(prompt);

    console.log();
    const answer = await askUser(chalk.yellow('[a]ccept [r]eject [f]lag (or Enter to skip): '));

    if (answer === 'a' || answer === 'accept') {
      recordFeedback(result.taskId, 'accept', undefined, undefined, taskType, domain);
      console.log(chalk.green('Feedback recorded: accepted'));
    } else if (answer === 'r' || answer === 'reject') {
      const reason = await askUser(chalk.yellow('Rejection reason (too generic / wrong facts / missing info / can\'t act on it / off topic / other): '));
      const dimension = await askUser(chalk.yellow('Dimension most affected (accuracy / completeness / relevance / actionability / specificity, or Enter to skip): '));
      recordFeedback(result.taskId, 'reject', reason || undefined, dimension || undefined, taskType, domain);
      console.log(chalk.green('Feedback recorded: rejected'));
    } else if (answer === 'f' || answer === 'flag') {
      const issue = await askUser(chalk.yellow('What is the issue? '));
      const dimension = await askUser(chalk.yellow('Dimension most affected (accuracy / completeness / relevance / actionability / specificity, or Enter to skip): '));
      recordFeedback(result.taskId, 'flag', issue || undefined, dimension || undefined, taskType, domain);
      console.log(chalk.green('Feedback recorded: flagged'));
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

// --- Feedback Command ---
program
  .command('feedback')
  .description('Show feedback summary (acceptance rate, rejection reasons)')
  .action(() => {
    init();
    const summary = getFeedbackSummary();

    console.log(chalk.blue('\n[Demiurgos] Feedback Summary\n'));

    if (summary.total === 0) {
      console.log(chalk.gray('  No feedback recorded yet. Use "demiurgos ask" and provide feedback after each response.'));
      return;
    }

    console.log(chalk.white('  Overview:'));
    console.log(`    Total: ${summary.total} | Accepted: ${summary.accepted} | Rejected: ${summary.rejected} | Flagged: ${summary.flagged}`);
    console.log(`    Acceptance rate: ${(summary.acceptanceRate * 100).toFixed(1)}%`);

    if (summary.rejectionReasons.length > 0) {
      console.log(chalk.white('\n  Top Rejection Reasons:'));
      for (const r of summary.rejectionReasons.slice(0, 10)) {
        console.log(`    ${chalk.red(r.count + 'x')} ${r.reason}`);
      }
    }

    if (summary.byDimension.length > 0) {
      console.log(chalk.white('\n  Issues by Dimension:'));
      for (const d of summary.byDimension) {
        console.log(`    ${chalk.yellow(d.dimension)}: ${d.count} issues`);
      }
    }

    if (summary.byTaskType.length > 0) {
      console.log(chalk.white('\n  By Task Type:'));
      for (const t of summary.byTaskType) {
        const total = t.accepted + t.rejected + t.flagged;
        const rate = total > 0 ? ((t.accepted / total) * 100).toFixed(1) : '0.0';
        console.log(`    ${t.taskType}: ${rate}% accepted (${t.accepted}/${total})`);
      }
    }

    if (summary.byDomain.length > 0) {
      console.log(chalk.white('\n  By Domain:'));
      for (const d of summary.byDomain) {
        const total = d.accepted + d.rejected + d.flagged;
        const rate = total > 0 ? ((d.accepted / total) * 100).toFixed(1) : '0.0';
        console.log(`    ${d.domain}: ${rate}% accepted (${d.accepted}/${total})`);
      }
    }

    console.log();
  });

// --- Calibrate Command ---
program
  .command('calibrate')
  .description('Force a threshold calibration run based on accumulated feedback')
  .action(() => {
    init();
    console.log(chalk.blue('\n[Demiurgos] Running calibration...\n'));

    const result = calibrate();

    if (result.adjustments.length === 0) {
      console.log(chalk.gray('  Not enough feedback to calibrate (minimum 5 entries needed).'));
      console.log(chalk.gray('  Use "demiurgos ask" and provide feedback to build calibration data.'));
      return;
    }

    console.log(chalk.green(`  Calibration complete. ${result.adjustments.length} threshold group(s) adjusted.\n`));

    for (const adj of result.adjustments) {
      const arrow = adj.direction === 'increase' ? chalk.red('\u2191') :
                     adj.direction === 'decrease' ? chalk.green('\u2193') : chalk.gray('-');
      console.log(chalk.white(`  ${adj.taskType} / ${adj.domain}:`));
      console.log(`    Acceptance rate: ${(adj.acceptanceRate * 100).toFixed(1)}% (${adj.feedbackCount} entries)`);
      console.log(`    Direction: ${arrow} ${adj.direction}`);

      const dimKeys = Object.keys(adj.dimensionAdjustments);
      if (dimKeys.length > 0) {
        console.log('    Threshold changes:');
        for (const [dim, delta] of Object.entries(adj.dimensionAdjustments)) {
          const sign = delta > 0 ? '+' : '';
          console.log(`      ${dim}: ${sign}${delta.toFixed(3)}`);
        }
      }

      const weightKeys = Object.keys(adj.weightAdjustments);
      if (weightKeys.length > 0) {
        console.log('    Weight adjustments:');
        for (const [dim, delta] of Object.entries(adj.weightAdjustments)) {
          console.log(`      ${dim}: +${delta.toFixed(3)} (from rejection reasons)`);
        }
      }

      console.log();
    }

    // Show recent calibration history
    const history = getCalibrationHistory(5);
    if (history.length > 1) {
      console.log(chalk.white('  Recent Calibration History:'));
      for (const h of history) {
        const adjCount = h.adjustments.length;
        console.log(chalk.gray(`    ${h.runAt} — ${h.feedbackCount} entries, ${adjCount} groups adjusted`));
      }
      console.log();
    }
  });

// --- Ingest YouTube Command ---
program
  .command('ingest-youtube')
  .description('Ingest a YouTube video transcript into knowledge base')
  .argument('<url>', 'YouTube video URL')
  .option('-d, --domain <domain>', 'Domain', 'general')
  .action(async (url: string, opts: { domain: string }) => {
    init();
    console.log(chalk.blue(`\n[Demiurgos] Ingesting YouTube video: ${url}\n`));
    console.log(chalk.gray('  Attempting whisper transcription, falling back to auto-captions...\n'));

    try {
      const result = await ingestYouTube(url, opts.domain);
      console.log(chalk.green(`  Ingested ${result.chunksAdded} chunks from "${result.source}" (${result.domain})`));
      console.log(chalk.gray(`  Total characters: ${result.totalCharacters}`));
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// --- Ingest Wikipedia Command ---
program
  .command('ingest-wiki')
  .description('Ingest a Wikipedia article into knowledge base')
  .argument('<title>', 'Wikipedia article title')
  .option('-d, --domain <domain>', 'Domain', 'general')
  .action(async (title: string, opts: { domain: string }) => {
    init();
    console.log(chalk.blue(`\n[Demiurgos] Ingesting Wikipedia article: "${title}"\n`));

    try {
      const result = await ingestWikipediaArticle(title, opts.domain);
      console.log(chalk.green(`  Ingested ${result.chunksAdded} chunks from "${result.source}" (${result.domain})`));
      console.log(chalk.gray(`  Total characters: ${result.totalCharacters}`));
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// --- Ingest USDA Command ---
program
  .command('ingest-usda')
  .description('Ingest curated USDA poultry production resources')
  .option('-d, --domain <domain>', 'Domain', 'farming')
  .action(async (opts: { domain: string }) => {
    init();
    const urls = getUSDAPoultryResources();
    console.log(chalk.blue(`\n[Demiurgos] Ingesting ${urls.length} USDA poultry resources...\n`));

    let successCount = 0;
    let failCount = 0;
    let totalChunks = 0;

    for (const url of urls) {
      try {
        console.log(chalk.gray(`  Fetching: ${url}`));
        const result = await ingestUSDADocument(url, opts.domain);
        totalChunks += result.chunksAdded;
        successCount++;
        console.log(chalk.green(`    +${result.chunksAdded} chunks`));
      } catch (err) {
        failCount++;
        console.log(chalk.yellow(`    Skipped: ${err instanceof Error ? err.message : String(err)}`));
      }
    }

    console.log();
    console.log(chalk.green(`  Done: ${successCount} sources ingested, ${totalChunks} total chunks`));
    if (failCount > 0) {
      console.log(chalk.yellow(`  ${failCount} sources could not be fetched (may require direct access)`));
    }
  });

// --- Parse & Execute ---
program.parse();
