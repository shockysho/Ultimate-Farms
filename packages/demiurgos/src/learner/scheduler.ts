// ============================================================
// DEMIURGOS — Active Learning Scheduler
// ============================================================
//
// Runs during idle time:
// 1. Detect knowledge gaps from task logs
// 2. Generate study plans
// 3. Execute study (ingest new knowledge)
// 4. Self-test (replay failed tasks)

import { detectGaps } from './gap-detector.js';
import { generateStudyPlans, type StudyPlan } from './study-planner.js';

export interface LearnerState {
  isRunning: boolean;
  lastRun: Date | null;
  gapsDetected: number;
  plansGenerated: number;
  idleMinutes: number;
}

let state: LearnerState = {
  isRunning: false,
  lastRun: null,
  gapsDetected: 0,
  plansGenerated: 0,
  idleMinutes: 0,
};

let idleTimer: ReturnType<typeof setInterval> | null = null;
let lastActivityTime = Date.now();

/**
 * Record that user activity occurred (resets idle timer).
 */
export function recordActivity(): void {
  lastActivityTime = Date.now();
  state.idleMinutes = 0;
}

/**
 * Start the idle monitoring loop.
 * After idleThresholdMinutes of no activity, triggers learning cycle.
 */
export function startIdleMonitor(idleThresholdMinutes = 10): void {
  if (idleTimer) return; // Already running

  idleTimer = setInterval(async () => {
    const idleMs = Date.now() - lastActivityTime;
    state.idleMinutes = Math.floor(idleMs / 60000);

    if (state.idleMinutes >= idleThresholdMinutes && !state.isRunning) {
      await runLearningCycle();
    }
  }, 60000); // Check every minute
}

/**
 * Stop the idle monitor.
 */
export function stopIdleMonitor(): void {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

/**
 * Run a learning cycle manually.
 */
export async function runLearningCycle(): Promise<{
  gaps: number;
  plans: StudyPlan[];
}> {
  state.isRunning = true;

  try {
    // Step 1: Detect gaps
    const gaps = detectGaps();
    state.gapsDetected = gaps.length;

    if (gaps.length === 0) {
      state.isRunning = false;
      state.lastRun = new Date();
      return { gaps: 0, plans: [] };
    }

    // Step 2: Generate study plans
    const plans = generateStudyPlans(gaps);
    state.plansGenerated = plans.length;

    // Step 3: Execute study plans
    // In production, this would:
    // - Fetch web pages from suggested sources
    // - Ingest content into knowledge store
    // - Run self-tests on failed prompts
    // For now, we just generate the plans and log them

    console.log(`[learner] Detected ${gaps.length} knowledge gaps`);
    for (const plan of plans) {
      console.log(`  [gap] ${plan.gap.domain}: ${plan.gap.description}`);
      console.log(`  [study] Queries: ${plan.searchQueries.join(', ')}`);
    }

    state.lastRun = new Date();
    state.isRunning = false;

    return { gaps: gaps.length, plans };
  } catch (error) {
    state.isRunning = false;
    throw error;
  }
}

/**
 * Get current learner state.
 */
export function getLearnerState(): LearnerState {
  return { ...state };
}
