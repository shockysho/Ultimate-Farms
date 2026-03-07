#!/usr/bin/env node
// ============================================================
// DEMIURGOS — CLI Interface
// ============================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { execute } from './engine.js';
import { initLogger, getCostSummary, getRecentTasks } from './logger.js';
import { checkAvailability, tierName } from './router.js';
import { Tier } from './types.js';

const program = new Command();

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
    initLogger();
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
    console.log(chalk.gray(`Evidence confidence: ${result.evaluation.overallEvidenceConfidence.toFixed(2)}`));
    console.log(chalk.gray(`Coherence confidence: ${result.evaluation.coherence.overall.toFixed(2)}`));
    console.log(chalk.gray(`Total confidence: ${result.evaluation.totalConfidence.toFixed(2)}`));
    console.log(chalk.gray(`Duration: ${result.duration}ms`));
    console.log(chalk.gray(`Cached: ${result.cached}`));

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
    initLogger();
    const summary = getCostSummary();

    console.log(chalk.blue('\n[Demiurgos] Cost Report\n'));

    console.log(chalk.white('Today:'));
    console.log(`  Spend: $${summary.today.totalUsd.toFixed(4)}`);
    console.log(`  Tasks: ${summary.today.taskCount}`);
    console.log(`  Cache hit rate: ${(summary.today.cacheHitRate * 100).toFixed(1)}%`);

    console.log(chalk.white('\nThis week:'));
    console.log(`  Spend: $${summary.thisWeek.totalUsd.toFixed(4)}`);
    console.log(`  Tasks: ${summary.thisWeek.taskCount}`);
    console.log(`  Cache hit rate: ${(summary.thisWeek.cacheHitRate * 100).toFixed(1)}%`);

    console.log(chalk.white('\nThis month:'));
    console.log(`  Spend: $${summary.thisMonth.totalUsd.toFixed(4)}`);
    console.log(`  Tasks: ${summary.thisMonth.taskCount}`);
    console.log(`  Cache hit rate: ${(summary.thisMonth.cacheHitRate * 100).toFixed(1)}%`);

    console.log(chalk.white('\nAll time:'));
    console.log(`  Spend: $${summary.allTime.totalUsd.toFixed(4)}`);
    console.log(`  Tasks: ${summary.allTime.taskCount}`);
    console.log(`  Cache hit rate: ${(summary.allTime.cacheHitRate * 100).toFixed(1)}%`);

    if (summary.byTier.length > 0) {
      console.log(chalk.white('\nBy tier:'));
      for (const t of summary.byTier) {
        console.log(`  ${tierName(t.tier as Tier)}: $${t.totalUsd.toFixed(4)} (${t.taskCount} tasks)`);
      }
    }

    if (summary.byModel.length > 0) {
      console.log(chalk.white('\nBy model:'));
      for (const m of summary.byModel) {
        console.log(`  ${m.model}: $${m.totalUsd.toFixed(4)} (${m.taskCount} tasks)`);
      }
    }
  });

// --- Status Command ---
program
  .command('status')
  .description('Check system health')
  .action(async () => {
    console.log(chalk.blue('\n[Demiurgos] System Status\n'));

    const availability = await checkAvailability();

    for (const [modelId, available] of Object.entries(availability)) {
      const status = available ? chalk.green('ONLINE') : chalk.red('OFFLINE');
      console.log(`  ${modelId}: ${status}`);
    }
  });

// --- History Command ---
program
  .command('history')
  .description('Show recent task history')
  .option('-n, --limit <count>', 'Number of entries', '10')
  .action((opts: { limit: string }) => {
    initLogger();
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
      console.log(chalk.gray(`    Model: ${t.modelUsed} | Cost: $${t.costUsd.toFixed(4)} | Score: ${t.qualityScore.toFixed(2)} | Confidence: ${t.totalConfidence.toFixed(2)}`));
      console.log();
    }
  });

// --- Parse & Execute ---
program.parse();
