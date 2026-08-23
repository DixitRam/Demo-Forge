/**
 * Caption edits. Same discipline as kfOps: the list stays time-ordered and
 * non-overlapping, enforced in one tested place rather than in handlers.
 */

import type { CaptionCue, DemoRecording } from '@demoforge/core';

export const MIN_CAPTION_MS = 400;
export const DEFAULT_CAPTION_MS = 2500;

export function captionSlotAt(
  cues: readonly CaptionCue[],
  t: number,
  durationMs: number,
): { tStart: number; tEnd: number } | null {
  if (cues.some((c) => t >= c.tStart && t < c.tEnd)) return null;
  const lo = cues.filter((c) => c.tEnd <= t).at(-1)?.tEnd ?? 0;
  const hi = cues.find((c) => c.tStart > t)?.tStart ?? durationMs;
  if (hi - lo < MIN_CAPTION_MS) return null;
  return { tStart: lo, tEnd: hi };
}

export function insertCaption(
  cues: readonly CaptionCue[],
  t: number,
  durationMs: number,
  text = 'New caption',
): CaptionCue[] {
  const slot = captionSlotAt(cues, t, durationMs);
  if (!slot) return [...cues];
  const tStart = Math.max(slot.tStart, Math.min(t, slot.tEnd - MIN_CAPTION_MS));
  const tEnd = Math.min(slot.tEnd, tStart + DEFAULT_CAPTION_MS);
  return [...cues, { tStart, tEnd, text }].sort((a, b) => a.tStart - b.tStart);
}

export function moveCaption(
  base: readonly CaptionCue[],
  index: number,
  mode: 'move' | 'start' | 'end',
  deltaMs: number,
  durationMs: number,
): CaptionCue[] {
  const cue = base[index];
  if (!cue) return [...base];

  const lo = base[index - 1]?.tEnd ?? 0;
  const hi = base[index + 1]?.tStart ?? durationMs;
  let { tStart, tEnd } = cue;

  if (mode === 'move') {
    const span = tEnd - tStart;
    tStart = Math.min(Math.max(tStart + deltaMs, lo), hi - span);
    tEnd = tStart + span;
  } else if (mode === 'start') {
    tStart = Math.min(Math.max(tStart + deltaMs, lo), tEnd - MIN_CAPTION_MS);
  } else {
    tEnd = Math.max(Math.min(tEnd + deltaMs, hi), tStart + MIN_CAPTION_MS);
  }

  const next = [...base];
  next[index] = { ...cue, tStart, tEnd };
  return next;
}

export function setCaptionText(
  cues: readonly CaptionCue[],
  index: number,
  text: string,
): CaptionCue[] {
  const cue = cues[index];
  if (!cue) return [...cues];
  const next = [...cues];
  next[index] = { ...cue, text };
  return next;
}

/**
 * A first draft from the click log — one cue per click that named something.
 * Not AI: it is just the element text the extension already recorded, which
 * is usually the verb the narration wants anyway.
 */
export function captionsFromClicks(rec: DemoRecording, holdMs = 2200): CaptionCue[] {
  const clicks = rec.events
    .filter((e) => e.type === 'click' && e.el?.text)
    .sort((a, b) => a.t - b.t);

  const out: CaptionCue[] = [];
  for (const c of clicks) {
    const text = `Click "${c.el!.text!}"`;
    const prev = out.at(-1);
    // Repeated clicks on the same control are one step, not two captions.
    if (prev && prev.text === text && c.t < prev.tEnd) {
      prev.tEnd = Math.min(rec.video.durationMs, c.t + holdMs);
      continue;
    }
    if (prev && prev.tEnd > c.t) prev.tEnd = c.t;
    out.push({ tStart: c.t, tEnd: Math.min(rec.video.durationMs, c.t + holdMs), text });
  }
  return out.filter((c) => c.tEnd - c.tStart >= MIN_CAPTION_MS);
}
