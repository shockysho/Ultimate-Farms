// ============================================================
// DEMIURGOS — Active Learning Scheduler
// ============================================================
//
// Runs during idle time:
// 1. Detect knowledge gaps from task logs
// 2. Generate study plans
// 3. Execute study (fetch + ingest new knowledge)
// 4. Self-test (replay failed tasks to verify improvement)

import { detectGaps } from './gap-detector.js';
import { generateStudyPlans, type StudyPlan } from './study-planner.js';
import { selfTest, type SelfTestReport } from './self-test.js';
import { ingestText } from '../knowledge/ingestor.js';
import { fetchAndExtract } from '../knowledge/sources/web.js';

export interface LearnerState {
  isRunning: boolean;
  lastRun: Date | null;
  gapsDetected: number;
  plansGenerated: number;
  plansExecuted: number;
  selfTestsRun: number;
  gapsFilled: number;
  idleMinutes: number;
}

let state: LearnerState = {
  isRunning: false,
  lastRun: null,
  gapsDetected: 0,
  plansGenerated: 0,
  plansExecuted: 0,
  selfTestsRun: 0,
  gapsFilled: 0,
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
  studied: number;
  selfTests: SelfTestReport[];
}> {
  state.isRunning = true;

  try {
    // Step 1: Detect gaps
    const gaps = detectGaps();
    state.gapsDetected = gaps.length;

    if (gaps.length === 0) {
      state.isRunning = false;
      state.lastRun = new Date();
      return { gaps: 0, plans: [], studied: 0, selfTests: [] };
    }

    // Step 2: Generate study plans
    const plans = generateStudyPlans(gaps);
    state.plansGenerated = plans.length;

    console.log(`[learner] Detected ${gaps.length} knowledge gaps`);

    // Step 3: Execute study plans — actually fetch and ingest content
    let studied = 0;
    for (const plan of plans.slice(0, 3)) { // Max 3 plans per cycle
      console.log(`  [gap] ${plan.gap.domain}: ${plan.gap.description}`);

      for (const query of plan.searchQueries.slice(0, 2)) { // Max 2 queries per plan
        try {
          // Search and ingest from web
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=2&format=json`;
          const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });

          if (searchResp.ok) {
            const [, , , urls] = await searchResp.json() as [string, string[], string[], string[]];

            for (const url of (urls ?? []).slice(0, 1)) {
              try {
                const text = await fetchAndExtract(url);
                if (text.length > 100) {
                  ingestText(text.slice(0, 10000), url, plan.gap.domain);
                  studied++;
                  console.log(`  [study] Ingested from ${url} (${text.length} chars)`);
                }
              } catch {
                // Failed to fetch this URL, skip
              }
            }
          }
        } catch {
          // Search failed, try next query
        }
      }
    }
    state.plansExecuted += studied;

    // Step 4: Self-test — replay failed tasks to verify improvement
    const selfTests: SelfTestReport[] = [];
    if (studied > 0) {
      console.log(`[learner] Running self-tests...`);
      const domainsStudied = [...new Set(plans.slice(0, 3).map(p => p.gap.domain))];

      for (const domain of domainsStudied) {
        try {
          const report = await selfTest(domain, 3); // Max 3 replays per domain
          selfTests.push(report);
          state.selfTestsRun++;

          if (report.gapFilled) {
            state.gapsFilled++;
            console.log(`  [self-test] ${domain}: Gap FILLED (${report.tasksImproved}/${report.tasksReplayed} improved, avg +${report.averageImprovement.toFixed(2)})`);
          } else {
            console.log(`  [self-test] ${domain}: Gap NOT filled (${report.tasksImproved}/${report.tasksReplayed} improved)`);
          }
        } catch {
          // Self-test failed, skip
        }
      }
    }

    state.lastRun = new Date();
    state.isRunning = false;

    return { gaps: gaps.length, plans, studied, selfTests };
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
