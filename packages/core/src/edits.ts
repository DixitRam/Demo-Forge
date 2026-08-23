/**
 * The edit list: spans of the source recording removed from the demo.
 *
 * This is the one place where "timeline time" and "source time" come apart.
 * The rule that keeps it cheap: everything else — zoom keyframes, captions,
 * the cursor path, the event log — stays in SOURCE time. Only playback and
 * the encoder walk edited time, and they convert here.
 *
 * Pure: no DOM, no I/O, fully testable.
 */

/** A span of source video that the demo skips over. */
export interface CutRegion {
  tStart: number;
  tEnd: number;
}

/** Shortest cut worth having — below this it is a mis-drag, not an edit. */
export const MIN_CUT_MS = 100;

/** A kept run of source video, and where it lands in the edited timeline. */
export interface Segment {
  /** Source time. */
  start: number;
  end: number;
  /** Edited time at `start`. */
  editedStart: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Sort, clamp to the recording, drop the too-short, and merge anything that
 * overlaps or touches. Every other function here assumes this shape, so a
 * hand-edited or agent-written list is repaired rather than trusted.
 */
export function normalizeCuts(cuts: readonly CutRegion[], durationMs: number): CutRegion[] {
  const sorted = cuts
    .map((c) => ({
      tStart: clamp(Math.min(c.tStart, c.tEnd), 0, durationMs),
      tEnd: clamp(Math.max(c.tStart, c.tEnd), 0, durationMs),
    }))
    .filter((c) => c.tEnd - c.tStart >= MIN_CUT_MS)
    .sort((a, b) => a.tStart - b.tStart);

  const merged: CutRegion[] = [];
  for (const c of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && c.tStart <= prev.tEnd) prev.tEnd = Math.max(prev.tEnd, c.tEnd);
    else merged.push({ ...c });
  }
  return merged;
}

/** The runs of source video that survive, in order. Never empty. */
export function keptSegments(cuts: readonly CutRegion[], durationMs: number): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  let edited = 0;

  for (const c of cuts) {
    if (c.tStart > cursor) {
      out.push({ start: cursor, end: c.tStart, editedStart: edited });
      edited += c.tStart - cursor;
    }
    cursor = Math.max(cursor, c.tEnd);
  }
  if (cursor < durationMs) out.push({ start: cursor, end: durationMs, editedStart: edited });

  // Everything cut: keep a sliver so the player and exporter always have a
  // frame to show rather than dividing by zero.
  if (out.length === 0) out.push({ start: 0, end: Math.min(durationMs, MIN_CUT_MS), editedStart: 0 });
  return out;
}

/** How long the demo actually runs. */
export function editedDuration(cuts: readonly CutRegion[], durationMs: number): number {
  const segs = keptSegments(cuts, durationMs);
  const last = segs[segs.length - 1]!;
  return last.editedStart + (last.end - last.start);
}

export function cutAt(cuts: readonly CutRegion[], t: number): CutRegion | undefined {
  return cuts.find((c) => t >= c.tStart && t < c.tEnd);
}

/** Source time -> edited time. A moment inside a cut maps to the cut's seam. */
export function sourceToEdited(
  cuts: readonly CutRegion[],
  durationMs: number,
  t: number,
): number {
  const segs = keptSegments(cuts, durationMs);
  for (const s of segs) {
    if (t < s.start) return s.editedStart;
    if (t <= s.end) return s.editedStart + (t - s.start);
  }
  const last = segs[segs.length - 1]!;
  return last.editedStart + (last.end - last.start);
}

/** Edited time -> source time. The inverse, exact on kept ground. */
export function editedToSource(
  cuts: readonly CutRegion[],
  durationMs: number,
  edited: number,
): number {
  const segs = keptSegments(cuts, durationMs);
  for (const s of segs) {
    const span = s.end - s.start;
    if (edited < s.editedStart + span) return s.start + Math.max(0, edited - s.editedStart);
  }
  return segs[segs.length - 1]!.end;
}

/**
 * Where playback should jump to when it wanders into a cut, or null if it has
 * not. Returns the recording's end when the tail itself is cut.
 */
export function skipTarget(
  cuts: readonly CutRegion[],
  durationMs: number,
  t: number,
): number | null {
  const cut = cutAt(cuts, t);
  if (!cut) return null;
  return Math.min(cut.tEnd, durationMs);
}

/** Total source time removed. */
export function cutDuration(cuts: readonly CutRegion[]): number {
  return cuts.reduce((n, c) => n + (c.tEnd - c.tStart), 0);
}
