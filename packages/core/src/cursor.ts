/**
 * Synthetic cursor path, derived from the click log. Pure.
 *
 * We draw our own cursor rather than relying on a captured OS cursor — that is
 * what makes Phase 3 (Playwright, which never moves a real cursor) work with no
 * extra machinery, and it lets us control the smoothing and the click bounce.
 */

import { clamp01, ease } from './easing.js';
import type { DemoRecording } from './types.js';

export interface CursorConfig {
  moveMs: number; // travel time into a click point
  pulseMs: number; // click bounce decay
}

export const DEFAULT_CURSOR_CONFIG: CursorConfig = { moveMs: 400, pulseMs: 250 };

export interface CursorState {
  xNorm: number;
  yNorm: number;
  clickPulse: number; // 1 at the moment of a click, decaying to 0
}

interface Waypoint {
  t: number;
  x: number;
  y: number;
}

/** Waypoints the cursor visits: every click, preceded by a centred start. */
export function cursorWaypoints(rec: DemoRecording): Waypoint[] {
  const pts: Waypoint[] = rec.events
    .filter((e) => e.type === 'click')
    .sort((a, b) => a.t - b.t)
    .map((e) => ({ t: e.t, x: e.xNorm, y: e.yNorm }));

  const first = pts[0];
  if (!first || first.t > 0) pts.unshift({ t: 0, x: 0.5, y: 0.5 });
  return pts;
}

export function cursorAt(
  rec: DemoRecording,
  t: number,
  cfg?: Partial<CursorConfig>,
): CursorState {
  const c = { ...DEFAULT_CURSOR_CONFIG, ...cfg };
  const pts = cursorWaypoints(rec);
  const last = pts[pts.length - 1]!;

  // Most recent click still pulsing.
  let clickPulse = 0;
  for (const p of pts) {
    if (p.t <= t && t < p.t + c.pulseMs) clickPulse = 1 - (t - p.t) / c.pulseMs;
  }

  if (t >= last.t) return { xNorm: last.x, yNorm: last.y, clickPulse };

  const i = pts.findIndex((p) => p.t > t);
  const to = pts[i]!;
  const from = pts[i - 1] ?? to;

  // Dwell at the previous point, then travel so we land exactly on time.
  const travel = Math.min(c.moveMs, to.t - from.t);
  const depart = to.t - travel;
  if (t <= depart || travel <= 0) return { xNorm: from.x, yNorm: from.y, clickPulse };

  const p = ease('easeInOutCubic', clamp01((t - depart) / travel));
  return {
    xNorm: from.x + (to.x - from.x) * p,
    yNorm: from.y + (to.y - from.y) * p,
    clickPulse,
  };
}
