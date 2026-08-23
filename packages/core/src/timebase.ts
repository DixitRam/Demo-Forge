/**
 * Timing-drift guard (risk #1 in 03_PHASE1_BUILD.md).
 *
 * Event times are stamped against t0 = MediaRecorder.start(). The container's
 * real decoded duration can disagree — dropped frames, a late first frame, a
 * lying WebM header. Reconcile the event clock against the video the editor
 * actually loaded, and shout if the drift is big enough to be visible.
 */

import type { DemoRecording } from './types.js';

export const DRIFT_TOLERANCE_MS = 100;

export interface ReconcileResult {
  rec: DemoRecording;
  warning?: string;
}

export function reconcileTimebase(
  rec: DemoRecording,
  actualDurationMs: number,
  toleranceMs: number = DRIFT_TOLERANCE_MS,
): ReconcileResult {
  const recorded = rec.video.durationMs;
  if (!Number.isFinite(actualDurationMs) || actualDurationMs <= 0 || recorded <= 0) {
    return { rec, warning: 'Could not determine the real video duration; event times left as-is.' };
  }

  const drift = actualDurationMs - recorded;
  const video = { ...rec.video, durationMs: actualDurationMs };

  if (Math.abs(drift) <= toleranceMs) return { rec: { ...rec, video } };

  const factor = actualDurationMs / recorded;
  return {
    rec: { ...rec, video, events: rec.events.map((e) => ({ ...e, t: e.t * factor })) },
    warning:
      `Timing drift ${drift.toFixed(0)}ms between demo.json (${recorded.toFixed(0)}ms) and the ` +
      `video (${actualDurationMs.toFixed(0)}ms). Rescaled event times by ${factor.toFixed(4)}.`,
  };
}
