// ============================================================
// DEMIURGOS — Feedback System (barrel export)
// ============================================================

export {
  initFeedbackTables,
  recordFeedback,
  getFeedbackSummary,
  getFeedbackForCalibration,
  getLastCalibrationTime,
  type FeedbackSummary,
  type FeedbackRecord,
} from './collector.js';

export {
  calibrate,
  getCalibrated,
  getCalibrationHistory,
  type CalibratedThreshold,
  type CalibrationAdjustment,
  type CalibrationHistoryEntry,
} from './calibrator.js';
