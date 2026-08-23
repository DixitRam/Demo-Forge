/**
 * The narration script — the spoken half of a demo.
 *
 * A line is text anchored to a source timestamp, on the same clock as every
 * event, zoom and cut. Nothing here knows how speech gets made: `audioMs` is
 * filled in once something has actually spoken the line, and until then the
 * length is estimated from the word count so the timeline can be laid out
 * before a single byte of audio exists.
 *
 * Audio is deliberately NOT part of a project file. The text is the source of
 * truth and speech is regenerated from it, which keeps a project a few
 * kilobytes of readable JSON instead of megabytes of base64.
 */

import type { DemoRecording } from './types.js';

export interface ScriptLine {
  /** Source-time anchor, ms. */
  tStart: number;
  text: string;
  /** Measured length of the synthesised speech. Absent until it is spoken. */
  audioMs?: number;
}

export interface VoiceStyle {
  /**
   * Provider voice id. The local espeak-ng provider takes `en-us+f3`; a hosted
   * one (ElevenLabs) will take its own ids — this stays an opaque string.
   */
  voice: string;
  /** Words per minute. */
  rate: number;
  /** Narration level, 0..1. */
  gain: number;
  /** What the captured tab audio drops to while narration plays, 0..1. */
  duck: number;
}

export const DEFAULT_VOICE: VoiceStyle = {
  voice: 'en-us+f3',
  rate: 170,
  gain: 1,
  duck: 0.25,
};

/** Breathing room between one line finishing and the next starting. */
export const MIN_LINE_GAP_MS = 200;

/** How long a line will take to say, before anything has said it. */
export function estimateSpeechMs(text: string, wpm = DEFAULT_VOICE.rate): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.round((words / Math.max(60, wpm)) * 60_000);
}

/** Measured length if we have one, estimate if we do not. */
export function lineDuration(line: ScriptLine, wpm = DEFAULT_VOICE.rate): number {
  return line.audioMs ?? estimateSpeechMs(line.text, wpm);
}

export function sortScript(lines: readonly ScriptLine[]): ScriptLine[] {
  return [...lines].sort((a, b) => a.tStart - b.tStart);
}

/** Total speech, which is not the same as the span it is spread over. */
export function scriptDuration(lines: readonly ScriptLine[], wpm = DEFAULT_VOICE.rate): number {
  return lines.reduce((sum, l) => sum + lineDuration(l, wpm), 0);
}

/**
 * Lines that talk over the next one, or over the end of the demo.
 *
 * Overlapping speech is the one way a narrated demo goes obviously wrong, and
 * it is invisible until you play it — so the editor surfaces it instead.
 */
export function scriptOverruns(
  lines: readonly ScriptLine[],
  durationMs: number,
  wpm = DEFAULT_VOICE.rate,
): number[] {
  const sorted = sortScript(lines);
  const out: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i]!.tStart + lineDuration(sorted[i]!, wpm);
    const limit = sorted[i + 1] ? sorted[i + 1]!.tStart - MIN_LINE_GAP_MS : durationMs;
    if (end > limit) out.push(i);
  }
  return out;
}

/** Where a line can be dropped without landing on top of another one. */
export function scriptSlotAt(
  lines: readonly ScriptLine[],
  t: number,
  durationMs: number,
  wpm = DEFAULT_VOICE.rate,
): boolean {
  if (t < 0 || t >= durationMs) return false;
  return !lines.some(
    (l) => t >= l.tStart - MIN_LINE_GAP_MS && t < l.tStart + lineDuration(l, wpm),
  );
}

export interface ScriptDraftConfig {
  /** Start speaking this long before the click it describes. */
  leadMs: number;
  intro: string;
}

export const DEFAULT_DRAFT: ScriptDraftConfig = {
  leadMs: 700,
  intro: "Here's a quick walkthrough.",
};

function phrase(tag: string, text: string | undefined, first: boolean): string {
  if (!text) {
    if (tag === 'input' || tag === 'textarea') return 'Fill in the details here.';
    return 'Then select this.';
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return `Enter your ${text.toLowerCase()} here.`;
  }
  return first ? `Start by clicking "${text}".` : `Next, click "${text}".`;
}

/**
 * A first draft straight from the click log — no AI, no transcript, just the
 * element text the extension already recorded, turned into sentences. It is a
 * scaffold to edit, not a script to ship.
 */
export function scriptFromClicks(
  rec: DemoRecording,
  cfg: Partial<ScriptDraftConfig> = {},
): ScriptLine[] {
  const { leadMs, intro } = { ...DEFAULT_DRAFT, ...cfg };
  const clicks = rec.events.filter((e) => e.type === 'click').sort((a, b) => a.t - b.t);

  const lines: ScriptLine[] = [];
  let lastText = '';
  for (const c of clicks) {
    const text = phrase(c.el?.tag ?? '', c.el?.text, lines.length === 0);
    // Repeated clicks on the same control are one step, not two sentences.
    if (text === lastText) continue;
    lastText = text;

    const tStart = Math.max(0, c.t - leadMs);
    const prev = lines.at(-1);
    // Don't stack a new line on top of one still being spoken; the draft is
    // meant to be playable before anyone touches it.
    if (prev && tStart < prev.tStart + estimateSpeechMs(prev.text) + MIN_LINE_GAP_MS) continue;
    lines.push({ tStart, text });
  }

  // The opening line only earns its place if it can finish before the first
  // step needs to be described.
  const room = lines[0]?.tStart ?? rec.video.durationMs;
  if (room >= estimateSpeechMs(intro) + MIN_LINE_GAP_MS) lines.unshift({ tStart: 0, text: intro });
  return lines;
}
