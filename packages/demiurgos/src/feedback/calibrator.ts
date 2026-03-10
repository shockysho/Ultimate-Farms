// ============================================================
// DEMIURGOS — Adaptive Threshold Calibrator
// Weekly calibration job that adjusts quality thresholds
// based on accumulated user feedback.
// ============================================================

import { randomUUID } from 'node:crypto';
import { getDb } from '../logger.js';
import { defaultThresholds } from '../config.js';
import { getFeedbackForCalibration, getLastCalibrationTime } from './collector.js';
import type { DimensionThresholds } from '../types.js';

// --- Constants ---

const INCREASE_STEP = 0.05;  // Bump thresholds up when acceptance < 80%
const DECREASE_STEP = 0.03;  // Nudge thresholds down when acceptance > 95%
const MIN_FEEDBACK_FOR_CALIBRATION = 5; // Minimum feedback entries to calibrate
const THRESHOLD_FLOOR = 0.3;  // Never go below this
const THRESHOLD_CEILING = 0.95; // Never go above this
const WEIGHT_ADJUSTMENT = 0.02; // Weight bump per rejection-reason match

// --- Reason-to-Dimension Mapping ---

const reasonToDimension: Record<string, keyof Omit<DimensionThresholds, 'weights'>> = {
  'too generic': 'specificity',
  'wrong facts': 'accuracy',
  'missing info': 'completeness',
  "can't act on it": 'actionability',
  'off topic': 'relevance',
};

// --- Calibrated Threshold Record ---

export interface CalibratedThreshold {
  id: string;
  taskType: string;
  domain: string;
  accuracy: number;
  completeness: number;
  relevance: number;
  actionability: number;
  specificity: number;
  weights: [number, number, number, number, number];
  calibratedAt: string;
}

export interface CalibrationAdjustment {
  taskType: string;
  domain: string;
  acceptanceRate: number;
  feedbackCount: number;
  direction: 'increase' | 'decrease' | 'stable';
  dimensionAdjustments: Record<string, number>;
  weightAdjustments: Record<string, number>;
}

// --- Main Calibration ---

export function calibrate(): { adjustments: CalibrationAdjustment[]; calibrationId: string } {
  const db = getDb();
  const lastCalibration = getLastCalibrationTime();

  // Pull all feedback since last calibration (or all feedback if first run)
  const allFeedback = getFeedbackForCalibration(undefined, undefined, lastCalibration ?? undefined);

  if (allFeedback.length < MIN_FEEDBACK_FOR_CALIBRATION) {
    // Not enough data to calibrate — record the run but make no adjustments
    const calibrationId = randomUUID();
    db.prepare(`
      INSERT INTO calibration_runs (id, feedback_count, adjustments_json)
      VALUES (?, ?, ?)
    `).run(calibrationId, allFeedback.length, '[]');
    return { adjustments: [], calibrationId };
  }

  // Group feedback by task_type + domain
  const groups = new Map<string, typeof allFeedback>();
  for (const fb of allFeedback) {
    const key = `${fb.taskType ?? 'unknown'}::${fb.domain ?? 'general'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fb);
  }

  const adjustments: CalibrationAdjustment[] = [];

  for (const [key, feedbackGroup] of groups) {
    const [taskType, domain] = key.split('::');
    const total = feedbackGroup.length;
    const accepted = feedbackGroup.filter(f => f.verdict === 'accept').length;
    const acceptanceRate = total > 0 ? accepted / total : 0;

    // Load current thresholds (calibrated or defaults)
    const current = getCalibrated(taskType, domain);

    // Clone for modification
    const newThresholds: DimensionThresholds = {
      accuracy: current.accuracy,
      completeness: current.completeness,
      relevance: current.relevance,
      actionability: current.actionability,
      specificity: current.specificity,
      weights: [...current.weights] as [number, number, number, number, number],
    };

    const dimensionAdjustments: Record<string, number> = {};
    const weightAdjustments: Record<string, number> = {};
    let direction: 'increase' | 'decrease' | 'stable' = 'stable';

    // --- Threshold Adjustment Based on Acceptance Rate ---
    if (acceptanceRate < 0.80) {
      // Too many rejections: thresholds are too low, quality is poor.
      // Increase thresholds to force higher quality.
      direction = 'increase';
      const dims: (keyof Omit<DimensionThresholds, 'weights'>)[] = [
        'accuracy', 'completeness', 'relevance', 'actionability', 'specificity',
      ];
      for (const dim of dims) {
        const oldVal = newThresholds[dim];
        newThresholds[dim] = clamp(oldVal + INCREASE_STEP);
        dimensionAdjustments[dim] = newThresholds[dim] - oldVal;
      }
    } else if (acceptanceRate > 0.95) {
      // Very high acceptance: thresholds might be too strict, causing
      // unnecessary escalations. Decrease slightly to save cost.
      direction = 'decrease';
      const dims: (keyof Omit<DimensionThresholds, 'weights'>)[] = [
        'accuracy', 'completeness', 'relevance', 'actionability', 'specificity',
      ];
      for (const dim of dims) {
        const oldVal = newThresholds[dim];
        newThresholds[dim] = clamp(oldVal - DECREASE_STEP);
        dimensionAdjustments[dim] = newThresholds[dim] - oldVal;
      }
    }

    // --- Weight Adjustment Based on Rejection Reasons ---
    const rejections = feedbackGroup.filter(f => f.verdict === 'reject' || f.verdict === 'flag');
    const dimensionIndex: Record<string, number> = {
      accuracy: 0, completeness: 1, relevance: 2, actionability: 3, specificity: 4,
    };

    for (const fb of rejections) {
      if (!fb.reason) continue;
      const reasonLower = fb.reason.toLowerCase().trim();

      // Check each known reason pattern
      for (const [pattern, dimension] of Object.entries(reasonToDimension)) {
        if (reasonLower.includes(pattern)) {
          const idx = dimensionIndex[dimension];
          const oldWeight = newThresholds.weights[idx];
          newThresholds.weights[idx] = Math.min(0.5, oldWeight + WEIGHT_ADJUSTMENT);
          weightAdjustments[dimension] = (weightAdjustments[dimension] ?? 0) + WEIGHT_ADJUSTMENT;
        }
      }

      // Also check dimension_affected field directly
      if (fb.dimensionAffected && fb.dimensionAffected in dimensionIndex) {
        const idx = dimensionIndex[fb.dimensionAffected];
        const oldWeight = newThresholds.weights[idx];
        newThresholds.weights[idx] = Math.min(0.5, oldWeight + WEIGHT_ADJUSTMENT);
        weightAdjustments[fb.dimensionAffected] = (weightAdjustments[fb.dimensionAffected] ?? 0) + WEIGHT_ADJUSTMENT;
      }
    }

    // Normalize weights to sum to 1.0
    const weightSum = newThresholds.weights.reduce((s, w) => s + w, 0);
    if (weightSum > 0) {
      newThresholds.weights = newThresholds.weights.map(w => w / weightSum) as [number, number, number, number, number];
    }

    // Store calibrated thresholds
    const thresholdId = randomUUID();
    db.prepare(`
      INSERT INTO calibrated_thresholds (id, task_type, domain, accuracy, completeness, relevance, actionability, specificity, weights_json, calibrated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      thresholdId, taskType, domain,
      newThresholds.accuracy, newThresholds.completeness, newThresholds.relevance,
      newThresholds.actionability, newThresholds.specificity,
      JSON.stringify(newThresholds.weights),
    );

    adjustments.push({
      taskType,
      domain,
      acceptanceRate,
      feedbackCount: total,
      direction,
      dimensionAdjustments,
      weightAdjustments,
    });
  }

  // Record the calibration run
  const calibrationId = randomUUID();
  db.prepare(`
    INSERT INTO calibration_runs (id, feedback_count, adjustments_json)
    VALUES (?, ?, ?)
  `).run(calibrationId, allFeedback.length, JSON.stringify(adjustments));

  return { adjustments, calibrationId };
}

// --- Get Calibrated Thresholds ---

export function getCalibrated(taskType: string, domain: string): DimensionThresholds {
  const db = getDb();

  // Try exact match first (task_type + domain)
  let row = db.prepare(`
    SELECT accuracy, completeness, relevance, actionability, specificity, weights_json
    FROM calibrated_thresholds
    WHERE task_type = ? AND domain = ?
    ORDER BY calibrated_at DESC
    LIMIT 1
  `).get(taskType, domain) as {
    accuracy: number; completeness: number; relevance: number;
    actionability: number; specificity: number; weights_json: string;
  } | undefined;

  // Fallback: try task_type with 'general' domain
  if (!row) {
    row = db.prepare(`
      SELECT accuracy, completeness, relevance, actionability, specificity, weights_json
      FROM calibrated_thresholds
      WHERE task_type = ? AND domain = 'general'
      ORDER BY calibrated_at DESC
      LIMIT 1
    `).get(taskType) as typeof row;
  }

  // Fallback: try 'unknown' task_type with matching domain
  if (!row) {
    row = db.prepare(`
      SELECT accuracy, completeness, relevance, actionability, specificity, weights_json
      FROM calibrated_thresholds
      WHERE task_type = 'unknown' AND domain = ?
      ORDER BY calibrated_at DESC
      LIMIT 1
    `).get(domain) as typeof row;
  }

  if (row) {
    const weights = JSON.parse(row.weights_json) as [number, number, number, number, number];
    return {
      accuracy: row.accuracy,
      completeness: row.completeness,
      relevance: row.relevance,
      actionability: row.actionability,
      specificity: row.specificity,
      weights,
    };
  }

  // No calibrated thresholds found — return defaults
  return {
    accuracy: defaultThresholds.accuracy,
    completeness: defaultThresholds.completeness,
    relevance: defaultThresholds.relevance,
    actionability: defaultThresholds.actionability,
    specificity: defaultThresholds.specificity,
    weights: [...defaultThresholds.weights] as [number, number, number, number, number],
  };
}

// --- Calibration History ---

export interface CalibrationHistoryEntry {
  id: string;
  runAt: string;
  feedbackCount: number;
  adjustments: CalibrationAdjustment[];
}

export function getCalibrationHistory(limit = 20): CalibrationHistoryEntry[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, run_at as runAt, feedback_count as feedbackCount, adjustments_json as adjustmentsJson
    FROM calibration_runs
    ORDER BY run_at DESC
    LIMIT ?
  `).all(limit) as { id: string; runAt: string; feedbackCount: number; adjustmentsJson: string }[];

  return rows.map(row => ({
    id: row.id,
    runAt: row.runAt,
    feedbackCount: row.feedbackCount,
    adjustments: JSON.parse(row.adjustmentsJson) as CalibrationAdjustment[],
  }));
}

// --- Helpers ---

function clamp(value: number): number {
  return Math.max(THRESHOLD_FLOOR, Math.min(THRESHOLD_CEILING, value));
}
