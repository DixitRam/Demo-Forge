/**
 * Synthetic cursor path, derived from the event log. Pure.
 *
 * We draw our own cursor rather than relying on a captured OS cursor — that is
 * what makes Phase 3 (Playwright, which never moves a real cursor) work with no
 * extra machinery, and it lets us control the smoothing and the click bounce.
 *
 * The path is meant to read as a hand on a mouse, not a robot: it visits every
 * click and every `move` (hover, attention circle), travels on a gentle arc
 * whose duration grows with distance, overshoots a touch on long moves, and
 * never sits perfectly still while parked. It still lands exactly on each
 * waypoint at its time.
 */

import { clamp01 } from './easing.js';
import type { DemoRecording } from './types.js';

export interface CursorConfig {
  moveMs: number; // travel time into a waypoint, for a mid-length move
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
  click: boolean;
}

/** Idle wander while parked, in normalised units (~6 px on a 1440 px frame). */
const DRIFT = 0.004;
/** Drift fades in over this long after arriving, and out before leaving. */
const DRIFT_RAMP_MS = 600;

/** Waypoints the cursor visits: every click and move, preceded by a centred start. */
export function cursorWaypoints(rec: DemoRecording): Waypoint[] {
  const pts: Waypoint[] = rec.events
    .filter((e) => e.type === 'click' || e.type === 'move')
    .sort((a, b) => a.t - b.t)
    .map((e) => ({ t: e.t, x: e.xNorm, y: e.yNorm, click: e.type === 'click' }));

  const first = pts[0];
  if (!first || first.t > 0) pts.unshift({ t: 0, x: 0.5, y: 0.5, click: false });
  return pts;
}

/** Zero velocity at both ends. */
const smoothstep = (p: number) => p * p * (3 - 2 * p);

/** Ends at 1 but passes it briefly first; c = 0 is a plain ease-out. */
function backOut(p: number, c: number): number {
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
}

/** Travel time: short hops are quick, long sweeps take longer. */
function travelMs(moveMs: number, dist: number): number {
  return moveMs * (0.6 + 1.2 * Math.min(dist, 1));
}

/** Slow, non-repeating wander around a parked point. */
function drift(t: number, seed: number): { dx: number; dy: number } {
  return {
    dx: DRIFT * (0.6 * Math.sin(t / 830 + seed) + 0.4 * Math.sin(t / 370 + seed * 2.3)),
    dy: DRIFT * (0.6 * Math.cos(t / 1110 + seed * 1.7) + 0.4 * Math.sin(t / 510 + seed)),
  };
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
    if (p.click && p.t <= t && t < p.t + c.pulseMs) clickPulse = 1 - (t - p.t) / c.pulseMs;
  }

  if (t >= last.t) {
    const { dx, dy } = drift(t, pts.length);
    const k = clamp01((t - last.t) / DRIFT_RAMP_MS);
    return { xNorm: last.x + dx * k, yNorm: last.y + dy * k, clickPulse };
  }

  const i = pts.findIndex((p) => p.t > t);
  const to = pts[i]!;
  const from = pts[i - 1] ?? to;

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const travel = Math.min(travelMs(c.moveMs, dist), to.t - from.t);
  const depart = to.t - travel;

  // Parked: wander a little, fading in after arrival and out before leaving,
  // so the cursor is exactly on the point at both ends.
  if (t <= depart || travel <= 0) {
    const { dx, dy } = drift(t, i);
    const k = Math.min(clamp01((t - from.t) / DRIFT_RAMP_MS), clamp01((depart - t) / DRIFT_RAMP_MS));
    return { xNorm: from.x + dx * k, yNorm: from.y + dy * k, clickPulse };
  }

  // Consecutive quick moves (an attention circle) are one continuous gesture:
  // constant speed, no stop at each point.
  if (!from.click && !to.click && i > 1 && to.t - from.t < 300) {
    const p = clamp01((t - from.t) / (to.t - from.t));
    return { xNorm: from.x + (to.x - from.x) * p, yNorm: from.y + (to.y - from.y) * p, clickPulse };
  }

  // Travel on a quadratic arc: the control point sits off the straight line,
  // alternating sides so consecutive moves don't all bow the same way.
  const side = i % 2 === 0 ? 1 : -1;
  const bow = 0.18 * dist * side;
  const cx = (from.x + to.x) / 2 - (to.y - from.y) * bow / (dist || 1);
  const cy = (from.y + to.y) / 2 + (to.x - from.x) * bow / (dist || 1);

  // Long moves overshoot slightly and settle back; short ones just ease in.
  const p = backOut(smoothstep(clamp01((t - depart) / travel)), dist > 0.15 ? 0.7 : 0);
  const u = 1 - p;
  return {
    xNorm: u * u * from.x + 2 * u * p * cx + p * p * to.x,
    yNorm: u * u * from.y + 2 * u * p * cy + p * p * to.y,
    clickPulse,
  };
}
