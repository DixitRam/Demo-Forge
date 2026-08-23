/**
 * The zoom planner. Pure: no DOM, no React, no I/O.
 *
 * This is the literal same code path for a human recording (Phase 1) and a
 * Playwright run (Phase 3). It never reads `rec.source`.
 */

import type { DemoEvent, DemoRecording } from './types.js';
import type { Easing } from './easing.js';

export interface ZoomKeyframe {
  tStart: number;
  tEnd: number; // ms
  targetXNorm: number;
  targetYNorm: number;
  scale: number; // 1.0 = no zoom
  easing: Easing;
  /**
   * Where the target came from. 'auto' (the default) means it was derived from
   * the click log and may be re-derived when the keyframe is moved in time;
   * 'manual' means a human placed it and nothing should move it again.
   */
  focus?: 'auto' | 'manual';
}

/**
 * The moment a zoom is fully zoomed in — the click it was planned for. Used
 * when re-aiming an auto-focus zoom that the user dragged along the timeline.
 */
export function zoomAnchor(kf: ZoomKeyframe, transitionMs = DEFAULT_ZOOM_CONFIG.transitionMs): number {
  return kf.tStart + Math.min(transitionMs, (kf.tEnd - kf.tStart) / 2);
}

export interface ZoomConfig {
  debounceMs: number; // merge clicks closer than this
  holdMs: number; // stay zoomed after a click
  zoomScale: number;
  maxTargetAreaRatio: number; // skip zoom if element bigger than this fraction of viewport
  transitionMs: number; // ease in/out duration
}

export const DEFAULT_ZOOM_CONFIG: ZoomConfig = {
  debounceMs: 400,
  holdMs: 1200,
  zoomScale: 1.8,
  maxTargetAreaRatio: 0.6,
  transitionMs: 500,
};

/**
 * Keep the visible box inside the video. At scale s the visible half-extent is
 * 0.5/s in normalised space on BOTH axes — uniform scaling means this is
 * independent of aspect ratio, resolution and DPR.
 */
export function clampTarget(v: number, scale: number): number {
  const half = 0.5 / scale;
  if (half >= 0.5) return 0.5; // scale <= 1: nothing to pan
  return Math.min(Math.max(v, half), 1 - half);
}

/** Element area as a fraction of the viewport. Both are CSS px, so DPR cancels. */
function areaRatio(ev: DemoEvent, viewportArea: number): number {
  if (!ev.el || viewportArea <= 0) return 0;
  return (ev.el.rect.w * ev.el.rect.h) / viewportArea;
}

export function planZooms(rec: DemoRecording, cfg?: Partial<ZoomConfig>): ZoomKeyframe[] {
  const c: ZoomConfig = { ...DEFAULT_ZOOM_CONFIG, ...cfg };
  const viewportArea = rec.viewport.w * rec.viewport.h;

  const clicks = rec.events.filter((e) => e.type === 'click').sort((a, b) => a.t - b.t);

  // Merge clicks closer together than debounceMs into one cluster; the last
  // click in a cluster wins (that is where the user ended up looking).
  const clusters: DemoEvent[] = [];
  for (const ev of clicks) {
    const prev = clusters[clusters.length - 1];
    if (prev && ev.t - prev.t < c.debounceMs) clusters[clusters.length - 1] = ev;
    else clusters.push(ev);
  }

  const kfs: ZoomKeyframe[] = [];
  for (const ev of clusters) {
    // Too big to be worth zooming to (page body, full-width hero, ...).
    if (areaRatio(ev, viewportArea) > c.maxTargetAreaRatio) continue;

    // Fully zoomed AT the click: ease in over transitionMs beforehand.
    const tStart = Math.max(0, ev.t - c.transitionMs);
    const tEnd = Math.min(rec.video.durationMs, ev.t + c.holdMs + c.transitionMs);
    if (tEnd <= tStart) continue;

    kfs.push({
      tStart,
      tEnd,
      targetXNorm: clampTarget(ev.xNorm, c.zoomScale),
      targetYNorm: clampTarget(ev.yNorm, c.zoomScale),
      scale: c.zoomScale,
      easing: 'easeInOutCubic',
    });
  }

  // Keyframes must be sorted and non-overlapping: a later zoom cuts the
  // previous hold short. evaluateZoom() reads exact adjacency (prev.tEnd ===
  // next.tStart) as "chained" and pans between the two at constant scale
  // instead of bouncing out to 1.0 and back in.
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (a.tEnd > b.tStart) a.tEnd = b.tStart;
  }

  return kfs.filter((k) => k.tEnd > k.tStart);
}
