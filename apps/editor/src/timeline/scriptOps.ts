/**
 * Script edits. Same discipline as captionOps: the list stays time-ordered,
 * enforced here rather than in handlers.
 *
 * A line's length is however long the speech turns out to be, so unlike a
 * caption it has no draggable end — only an anchor. Overlaps are allowed and
 * reported (see scriptOverruns) rather than prevented, because the fix is
 * usually to shorten the words, not to shove the line.
 */

import { lineDuration, sortScript, type ScriptLine } from '@demoforge/core';

export function insertLine(
  lines: readonly ScriptLine[],
  t: number,
  durationMs: number,
  text = 'New line.',
): ScriptLine[] {
  const tStart = Math.min(Math.max(0, t), durationMs);
  return sortScript([...lines, { tStart, text }]);
}

export function moveLine(
  base: readonly ScriptLine[],
  index: number,
  deltaMs: number,
  durationMs: number,
): ScriptLine[] {
  const line = base[index];
  if (!line) return [...base];
  const next = [...base];
  next[index] = { ...line, tStart: Math.min(Math.max(0, line.tStart + deltaMs), durationMs) };
  return next;
}

/**
 * Changing the words invalidates the measured length — keeping it would lay
 * the timeline out for audio that no longer exists.
 */
export function setLineText(
  lines: readonly ScriptLine[],
  index: number,
  text: string,
): ScriptLine[] {
  const line = lines[index];
  if (!line) return [...lines];
  const next = [...lines];
  const { audioMs: _drop, ...rest } = line;
  next[index] = { ...rest, text };
  return next;
}

export function deleteLine(lines: readonly ScriptLine[], index: number): ScriptLine[] {
  return lines.filter((_, i) => i !== index);
}

/**
 * Push every line just far enough apart that nothing talks over anything else,
 * keeping the first anchor where the author put it.
 */
export function spaceOutScript(
  lines: readonly ScriptLine[],
  wpm: number,
  gapMs: number,
): ScriptLine[] {
  const sorted = sortScript(lines);
  let floor = 0;
  return sorted.map((l) => {
    const tStart = Math.max(l.tStart, floor);
    floor = tStart + lineDuration(l, wpm) + gapMs;
    return { ...l, tStart };
  });
}
