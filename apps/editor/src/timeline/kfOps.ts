/**
 * Timeline edits on ZoomKeyframe[]. Pure, so the invariant the evaluator
 * depends on — sorted, non-overlapping — is enforced in one tested place
 * rather than in pointer handlers.
 *
 * Dragging two pills flush against each other is meaningful: adjacency is what
 * evaluateZoom reads as "chained", so they pan into each other at constant
 * scale instead of bouncing out to 1.0 between them.
 */

import {
  DEFAULT_ZOOM_CONFIG,
  clampTarget,
  zoomAnchor,
  type DemoRecording,
  type ZoomKeyframe,
} from '@demoforge/core';

/** A pill shorter than this cannot be grabbed, let alone seen. */
export const MIN_PILL_MS = 200;

/** Pointer distance, in ms, within which an edge sticks to a snap target. */
export function snapWithin(pxPerMs: number, px = 8): number {
  return pxPerMs > 0 ? px / pxPerMs : 0;
}

function snap(value: number, targets: readonly number[], tolerance: number): number {
  let best = value;
  let bestGap = tolerance;
  for (const t of targets) {
    const gap = Math.abs(t - value);
    if (gap <= bestGap) {
      best = t;
      bestGap = gap;
    }
  }
  return best;
}

export type DragMode = 'move' | 'start' | 'end';

export interface DragContext {
  durationMs: number;
  /** Times worth sticking to: neighbouring edges, clicks, the ends. */
  snapTargets: readonly number[];
  tolerance: number;
  /** Present when auto-focus zooms should re-aim as they move in time. */
  rec?: DemoRecording;
}

/**
 * Apply a drag to keyframe `index` of `base` (the array as it was when the
 * drag started) and return the new array, clamped so it stays sorted and
 * non-overlapping.
 */
export function applyDrag(
  base: readonly ZoomKeyframe[],
  index: number,
  mode: DragMode,
  deltaMs: number,
  ctx: DragContext,
): ZoomKeyframe[] {
  const kf = base[index];
  if (!kf) return [...base];

  const lo = base[index - 1]?.tEnd ?? 0;
  const hi = base[index + 1]?.tStart ?? ctx.durationMs;

  let tStart = kf.tStart;
  let tEnd = kf.tEnd;

  if (mode === 'move') {
    const span = kf.tEnd - kf.tStart;
    tStart = snap(kf.tStart + deltaMs, ctx.snapTargets, ctx.tolerance);
    tStart = Math.min(Math.max(tStart, lo), hi - span);
    tEnd = tStart + span;
  } else if (mode === 'start') {
    tStart = snap(kf.tStart + deltaMs, ctx.snapTargets, ctx.tolerance);
    tStart = Math.min(Math.max(tStart, lo), tEnd - MIN_PILL_MS);
  } else {
    tEnd = snap(kf.tEnd + deltaMs, ctx.snapTargets, ctx.tolerance);
    tEnd = Math.max(Math.min(tEnd, hi), tStart + MIN_PILL_MS);
  }

  const moved: ZoomKeyframe = { ...kf, tStart, tEnd };

  // An auto-focus zoom is "whatever was clicked here", so dragging it along
  // the timeline re-aims it. A manually placed one stays exactly where the
  // user put it.
  if (ctx.rec && moved.focus !== 'manual') {
    const aim = nearestClickTarget(ctx.rec, zoomAnchor(moved));
    moved.targetXNorm = clampTarget(aim.xNorm, moved.scale);
    moved.targetYNorm = clampTarget(aim.yNorm, moved.scale);
  }

  const next = [...base];
  next[index] = moved;
  return next;
}

/** Place the focus point by hand; the zoom stops tracking the click log. */
export function setTarget(
  kfs: readonly ZoomKeyframe[],
  index: number,
  xNorm: number,
  yNorm: number,
): ZoomKeyframe[] {
  const kf = kfs[index];
  if (!kf) return [...kfs];
  const next = [...kfs];
  next[index] = {
    ...kf,
    targetXNorm: clampTarget(xNorm, kf.scale),
    targetYNorm: clampTarget(yNorm, kf.scale),
    focus: 'manual',
  };
  return next;
}

/** Hand the zoom back to the click log. */
export function resetFocus(
  kfs: readonly ZoomKeyframe[],
  index: number,
  rec: DemoRecording,
): ZoomKeyframe[] {
  const kf = kfs[index];
  if (!kf) return [...kfs];
  const aim = nearestClickTarget(rec, zoomAnchor(kf));
  const next = [...kfs];
  next[index] = {
    ...kf,
    targetXNorm: clampTarget(aim.xNorm, kf.scale),
    targetYNorm: clampTarget(aim.yNorm, kf.scale),
    focus: 'auto',
  };
  return next;
}

export function setFocusMode(
  kfs: readonly ZoomKeyframe[],
  index: number,
  mode: 'auto' | 'manual',
  rec: DemoRecording,
): ZoomKeyframe[] {
  if (mode === 'auto') return resetFocus(kfs, index, rec);
  const kf = kfs[index];
  if (!kf) return [...kfs];
  const next = [...kfs];
  next[index] = { ...kf, focus: 'manual' };
  return next;
}

/** Largest free slot containing `t`, or null if the point is already covered. */
export function freeSlotAt(
  kfs: readonly ZoomKeyframe[],
  t: number,
  durationMs: number,
): { tStart: number; tEnd: number } | null {
  if (kfs.some((k) => t >= k.tStart && t < k.tEnd)) return null;
  const lo = kfs.filter((k) => k.tEnd <= t).at(-1)?.tEnd ?? 0;
  const hi = kfs.find((k) => k.tStart > t)?.tStart ?? durationMs;
  if (hi - lo < MIN_PILL_MS) return null;
  return { tStart: lo, tEnd: hi };
}

/** The click nearest `t`, or the centre when the log has none. */
export function nearestClickTarget(
  rec: DemoRecording,
  t: number,
): { xNorm: number; yNorm: number } {
  let best: { d: number; xNorm: number; yNorm: number } = { d: Infinity, xNorm: 0.5, yNorm: 0.5 };
  for (const e of rec.events) {
    if (e.type !== 'click') continue;
    const d = Math.abs(e.t - t);
    if (d < best.d) best = { d, xNorm: e.xNorm, yNorm: e.yNorm };
  }
  return { xNorm: best.xNorm, yNorm: best.yNorm };
}

/**
 * Insert a zoom at `t`, aimed at the nearest click in the log (the user almost
 * always means "zoom on that thing"), falling back to the centre.
 */
export function insertZoom(
  kfs: readonly ZoomKeyframe[],
  rec: DemoRecording,
  t: number,
  scale = DEFAULT_ZOOM_CONFIG.zoomScale,
): ZoomKeyframe[] {
  const slot = freeSlotAt(kfs, t, rec.video.durationMs);
  if (!slot) return [...kfs];

  const c = DEFAULT_ZOOM_CONFIG;
  const want = c.transitionMs * 2 + c.holdMs;
  const tStart = Math.max(slot.tStart, Math.min(t - c.transitionMs, slot.tEnd - want));
  const tEnd = Math.min(slot.tEnd, Math.max(tStart + MIN_PILL_MS, tStart + want));

  const nearest = nearestClickTarget(rec, t);

  const kf: ZoomKeyframe = {
    tStart,
    tEnd,
    targetXNorm: clampTarget(nearest.xNorm, scale),
    targetYNorm: clampTarget(nearest.yNorm, scale),
    scale,
    easing: 'easeInOutCubic',
    focus: 'auto',
  };
  return [...kfs, kf].sort((a, b) => a.tStart - b.tStart);
}

/**
 * Rescale one keyframe. Deliberately does NOT re-clamp the target: clamping is
 * lossy, so sliding the scale up and back down again would leave the zoom
 * permanently off the thing it was aimed at. stageGeometry() clamps the source
 * rect against real video pixels every frame, which is where it belongs.
 */
export function setScale(
  kfs: readonly ZoomKeyframe[],
  index: number,
  scale: number,
): ZoomKeyframe[] {
  const kf = kfs[index];
  if (!kf) return [...kfs];
  const next = [...kfs];
  next[index] = { ...kf, scale };
  return next;
}
