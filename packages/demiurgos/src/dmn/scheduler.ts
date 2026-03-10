// ============================================================
// DEMIURGOS — DMN Scheduler
// ============================================================
//
// Orchestrates the full DMN cycle:
// Wander → Associate → Dream → Journal
// Runs during deep idle (30+ minutes of no activity).

import { getWanderingStore, initWanderingStore, wander } from './wanderer.js';
import { findAssociations } from './association.js';
import { dream, type DreamInsight } from './dreamer.js';
import { saveInsight, initInsightJournal } from './insight-journal.js';
import { getKnowledgeStore } from '../knowledge/ingestor.js';
import { getWanderingSources, resolveAPISource } from './sources.js';
import type { Provider } from '../types.js';

export interface DMNState {
  isRunning: boolean;
  lastRun: Date | null;
  totalCycles: number;
  totalInsights: number;
  totalWandered: number;
  idleMinutes: number;
}

let state: DMNState = {
  isRunning: false,
  lastRun: null,
  totalCycles: 0,
  totalInsights: 0,
  totalWandered: 0,
  idleMinutes: 0,
};

let dmnTimer: ReturnType<typeof setInterval> | null = null;
let lastActivityTime = Date.now();

/**
 * Record activity (resets DMN idle timer).
 */
export function recordDMNActivity(): void {
  lastActivityTime = Date.now();
  state.idleMinutes = 0;
}

/**
 * Start the DMN idle monitor.
 * After deepIdleMinutes of no activity, triggers a DMN cycle.
 */
export function startDMNMonitor(deepIdleMinutes = 30, model?: Provider): void {
  if (dmnTimer) return;

  dmnTimer = setInterval(async () => {
    const idleMs = Date.now() - lastActivityTime;
    state.idleMinutes = Math.floor(idleMs / 60000);

    if (state.idleMinutes >= deepIdleMinutes && !state.isRunning && model) {
      await runDMNCycle(model);
    }
  }, 60000);
}

/**
 * Stop the DMN monitor.
 */
export function stopDMNMonitor(): void {
  if (dmnTimer) {
    clearInterval(dmnTimer);
    dmnTimer = null;
  }
}

/**
 * Run a full DMN cycle manually.
 */
export async function runDMNCycle(model: Provider): Promise<DreamInsight[]> {
  state.isRunning = true;

  try {
    const wanderingStore = getWanderingStore() ?? initWanderingStore();
    const knowledgeStore = getKnowledgeStore();

    // Phase 1: Wander — fetch random content from curated sources
    console.log('[dmn] Phase 1: Wandering...');
    const sources = getWanderingSources(5);
    let wandered = 0;

    for (const source of sources) {
      try {
        const urls = await resolveAPISource(source);
        for (const url of urls.slice(0, 2)) {
          const entry = await wander(url, source.domain);
          if (entry) {
            wandered++;
            console.log(`  [wander] ${source.domain}: ${url.slice(0, 80)}...`);
          }
        }
      } catch {
        // Source unavailable, skip
      }
    }

    state.totalWandered += wandered;
    console.log(`[dmn] Wandered ${wandered} pages`);

    if (wanderingStore.size() === 0) {
      console.log('[dmn] No wandering material available. Skipping association phase.');
      state.isRunning = false;
      state.lastRun = new Date();
      state.totalCycles++;
      return [];
    }

    if (!knowledgeStore || knowledgeStore.size() === 0) {
      console.log('[dmn] No knowledge base available. Skipping association phase.');
      state.isRunning = false;
      state.lastRun = new Date();
      state.totalCycles++;
      return [];
    }

    // Phase 2: Associate — find cross-domain links
    console.log('[dmn] Phase 2: Finding cross-domain associations...');
    const links = findAssociations(wanderingStore, knowledgeStore);
    console.log(`[dmn] Found ${links.length} cross-domain links`);

    if (links.length === 0) {
      state.isRunning = false;
      state.lastRun = new Date();
      return [];
    }

    // Phase 3: Dream — generate insights from associations
    console.log('[dmn] Phase 3: Dreaming...');
    const insights = await dream(links, model);
    console.log(`[dmn] Generated ${insights.length} insights`);

    // Phase 4: Journal — save the good ones
    let saved = 0;
    for (const insight of insights) {
      const id = saveInsight(insight);
      if (id) saved++;
    }
    console.log(`[dmn] Saved ${saved} insights to journal`);

    state.totalCycles++;
    state.totalInsights += saved;
    state.lastRun = new Date();
    state.isRunning = false;

    return insights;
  } catch (error) {
    state.isRunning = false;
    console.error('[dmn] Cycle failed:', error);
    return [];
  }
}

/**
 * Get current DMN state.
 */
export function getDMNState(): DMNState {
  return { ...state };
}
