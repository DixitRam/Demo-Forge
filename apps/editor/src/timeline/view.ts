/**
 * The timeline's visible window. Pure, so the zoom/pan maths is testable
 * without a DOM — scroll handlers are a bad place to hide arithmetic.
 */

export interface View {
  start: number;
  end: number;
}

/** Never zoom in past this, or the playhead has nothing to sit on. */
export const MIN_SPAN_MS = 500;

export function clampView(view: View, durationMs: number): View {
  const span = Math.min(Math.max(view.end - view.start, MIN_SPAN_MS), durationMs);
  const start = Math.min(Math.max(view.start, 0), durationMs - span);
  return { start, end: start + span };
}

export function fullView(durationMs: number): View {
  return { start: 0, end: Math.max(durationMs, MIN_SPAN_MS) };
}

/** Zoom about a fixed time, so the point under the pointer stays put. */
export function zoomView(view: View, durationMs: number, anchorMs: number, factor: number): View {
  const span = view.end - view.start;
  const next = Math.min(Math.max(span * factor, MIN_SPAN_MS), durationMs);
  const ratio = span > 0 ? (anchorMs - view.start) / span : 0.5;
  return clampView({ start: anchorMs - ratio * next, end: anchorMs - ratio * next + next }, durationMs);
}

export function panView(view: View, durationMs: number, deltaMs: number): View {
  return clampView({ start: view.start + deltaMs, end: view.end + deltaMs }, durationMs);
}

/** Scroll the window just enough to bring `t` back into sight. */
export function revealTime(view: View, durationMs: number, t: number): View {
  const span = view.end - view.start;
  const margin = span * 0.1;
  if (t >= view.start + margin && t <= view.end - margin) return view;
  const next = clampView({ start: t - span / 2, end: t + span / 2 }, durationMs);
  // Pinned against an end (always, at full width), the window cannot move.
  // Hand back the same object, or the per-frame caller re-renders forever.
  return next.start === view.start && next.end === view.end ? view : next;
}
