/**
 * Evaluate the zoom envelope at a point in time. Pure.
 *
 * Shared by the live preview and the exporter so the two can never disagree.
 * Coordinates stay normalised 0..1 here; the caller converts to video pixels.
 */

import { ease, lerp } from './easing.js';
import { DEFAULT_ZOOM_CONFIG, type ZoomKeyframe } from './zoom-planner.js';

export interface ZoomState {
  scale: number;
  xNorm: number;
  yNorm: number;
}

export const IDLE_ZOOM: ZoomState = { scale: 1, xNorm: 0.5, yNorm: 0.5 };

const EPS = 1e-6;

function stateOf(kf: ZoomKeyframe): ZoomState {
  return { scale: kf.scale, xNorm: kf.targetXNorm, yNorm: kf.targetYNorm };
}

function mix(a: ZoomState, b: ZoomState, p: number): ZoomState {
  return {
    scale: lerp(a.scale, b.scale, p),
    xNorm: lerp(a.xNorm, b.xNorm, p),
    yNorm: lerp(a.yNorm, b.yNorm, p),
  };
}

/**
 * @param kfs sorted, non-overlapping (as produced by planZooms and maintained
 *            by the timeline editor)
 */
export function evaluateZoom(
  kfs: readonly ZoomKeyframe[],
  t: number,
  transitionMs: number = DEFAULT_ZOOM_CONFIG.transitionMs,
): ZoomState {
  const i = kfs.findIndex((k) => t >= k.tStart && t < k.tEnd);
  if (i === -1) return IDLE_ZOOM;

  const kf = kfs[i]!;
  const prev = kfs[i - 1];
  const next = kfs[i + 1];
  const here = stateOf(kf);

  // Adjacent keyframes are "chained": the previous zoom was cut short by this
  // one. The hand-off is a single transition owned by the LATER keyframe — it
  // ramps in from its predecessor's state (panning at constant scale rather
  // than popping out to 1.0), and the predecessor holds instead of ramping
  // out. Ramping on both sides of the boundary would double-transition.
  const chainedIn = !!prev && Math.abs(prev.tEnd - kf.tStart) < EPS;
  const chainedOut = !!next && Math.abs(kf.tEnd - next.tStart) < EPS;

  const ramp = Math.min(transitionMs, (kf.tEnd - kf.tStart) / 2);
  if (ramp <= 0) return here;

  if (t < kf.tStart + ramp) {
    const from = chainedIn ? stateOf(prev!) : IDLE_ZOOM;
    return mix(from, here, ease(kf.easing, (t - kf.tStart) / ramp));
  }
  if (!chainedOut && t > kf.tEnd - ramp) {
    return mix(IDLE_ZOOM, here, ease(kf.easing, (kf.tEnd - t) / ramp));
  }
  return here;
}
