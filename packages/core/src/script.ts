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

/**
 * Who speaks. `local` is espeak-ng on the machine running the dev server —
 * free, offline, robotic. `gemini` and `elevenlabs` are hosted, need a key,
 * and sound like people.
 */
export type VoiceProvider = 'local' | 'gemini' | 'elevenlabs';

export interface VoiceStyle {
  provider: VoiceProvider;
  /**
   * Provider voice id. espeak-ng takes `en-us+f3`, Gemini takes a prebuilt
   * name like `Iapetus` — an opaque string either way.
   */
  voice: string;
  /**
   * Words per minute. Only the local provider takes a number for this; a
   * hosted voice is steered with `direction` instead.
   */
  rate: number;
  /**
   * How to read it — tone, pace, accent. Free text handed to providers that
   * understand it and ignored by the ones that do not.
   */
  direction: string;
  /** Narration level, 0..1. */
  gain: number;
  /** What the captured tab audio drops to while narration plays, 0..1. */
  duck: number;
}

export const DEFAULT_VOICE: VoiceStyle = {
  provider: 'local',
  voice: 'en-us+f3',
  rate: 170,
  direction: '',
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

// --- steps for a writer ------------------------------------------------------

/**
 * What a script writer — human or model — is shown: the demo broken into the
 * moments that need narrating, each with how long there is to say it.
 *
 * This is deliberately separate from `scriptFromClicks`. That one *is* the
 * writer, and a crude one. This one only prepares the brief, so the writing
 * can be done by something that has actually looked at the screen.
 */
export interface ScriptStep {
  index: number;
  /** When it happens, source ms. */
  tMs: number;
  /** How long until the next step needs describing. */
  windowMs: number;
  /** Words that fit in that window at the configured pace. */
  maxWords: number;
  /** `open` is the establishing moment at the start; the rest are events. */
  action: 'open' | 'click' | 'input' | 'scroll' | 'nav';
  tag?: string;
  /** The element's own text, when the capture recorded any. */
  text?: string;
  xNorm?: number;
  yNorm?: number;
}

/** Two clicks closer than this are one step, not two things to say. */
export const STEP_MERGE_MS = 500;
/**
 * A step with less room than this cannot hold a sentence, so it is folded
 * into the one before it.
 *
 * Learned the hard way: three clicks a second apart got three-word budgets
 * and a writer split one sentence across them — "Select PM one," / "PM one
 * hundred," / "and PM ten." Each line was within budget and the result was
 * unusable. A burst of quick clicks is one thing to say, not several.
 */
export const MIN_STEP_WINDOW_MS = 1500;
/**
 * However fast the clicking, start a new thing to say at least this often.
 * Without it a minute of steady interaction folds into a single line.
 */
export const MAX_STEP_SPAN_MS = 6000;
/** Nobody can say anything useful in less than this. */
const MIN_WORDS = 3;
/** Leave room to breathe rather than filling every window to the brim. */
const PACE_HEADROOM = 0.85;

export function wordBudget(windowMs: number, wpm: number): number {
  return Math.max(MIN_WORDS, Math.floor((windowMs / 60_000) * wpm * PACE_HEADROOM));
}

/**
 * Break a recording into narratable steps: an opening, then one per click,
 * with repeated clicks on the same control merged.
 *
 * The window on the last step runs to the end of the demo, so a writer knows
 * it has room for a closing line rather than one more terse instruction.
 */
export function scriptSteps(rec: DemoRecording, wpm = DEFAULT_VOICE.rate): ScriptStep[] {
  const durationMs = rec.video.durationMs;
  const clicks = rec.events.filter((e) => e.type === 'click').sort((a, b) => a.t - b.t);

  const moments: Array<{ tMs: number; action: ScriptStep['action']; tag?: string; text?: string; xNorm?: number; yNorm?: number }> =
    [{ tMs: 0, action: 'open' }];

  for (const c of clicks) {
    const prev = moments.at(-1)!;
    // Proximity alone, the same rule the zoom planner debounces on: two
    // clicks a moment apart are one action, and there is no room to say two
    // things about them anyway. The first of a burst wins, so the narration
    // still leads the action rather than trailing it.
    if (c.t - prev.tMs < STEP_MERGE_MS) continue;
    moments.push({
      tMs: c.t,
      action: 'click',
      ...(c.el?.tag ? { tag: c.el.tag } : {}),
      ...(c.el?.text ? { text: c.el.text } : {}),
      xNorm: c.xNorm,
      yNorm: c.yNorm,
    });
  }

  // Fold each burst of quick clicks into the step that opened it, keeping
  // every label so the writer still knows what was touched. The opening step
  // never absorbs the first click: the intro is its own beat.
  const merged: typeof moments = [];
  // The gap that matters is to the PREVIOUS CLICK, not to the head of the
  // burst — otherwise a steady stream of clicks breaks apart after one hop.
  let lastT = -Infinity;
  for (const m of moments) {
    const prev = merged.at(-1);
    const closeToLast = m.tMs - lastT < MIN_STEP_WINDOW_MS;
    const stillRoom = !!prev && m.tMs - prev.tMs < MAX_STEP_SPAN_MS;
    if (prev && prev.action !== 'open' && closeToLast && stillRoom) {
      if (m.text && !prev.text?.split(', ').includes(m.text)) {
        prev.text = prev.text ? `${prev.text}, ${m.text}` : m.text;
      }
      lastT = m.tMs;
      continue;
    }
    merged.push({ ...m });
    lastT = m.tMs;
  }

  return merged.map((m, i) => {
    const windowMs = (merged[i + 1]?.tMs ?? durationMs) - m.tMs;
    return { index: i, ...m, windowMs, maxWords: wordBudget(windowMs, wpm) };
  });
}

/** One line of narration a writer produced, tied to the step it describes. */
export interface WrittenLine {
  step: number;
  text: string;
}

/**
 * Place written lines on the timeline.
 *
 * The words are the writer's; the timing stays ours. A model asked for
 * timestamps will invent plausible-looking ones, and plausible is not the
 * same as synchronised — so it only ever says *which step* a line belongs to.
 */
export function scriptFromSteps(
  steps: readonly ScriptStep[],
  written: readonly WrittenLine[],
  leadMs = DEFAULT_DRAFT.leadMs,
): ScriptLine[] {
  const byIndex = new Map(steps.map((s) => [s.index, s]));
  const lines: ScriptLine[] = [];

  for (const w of written) {
    const step = byIndex.get(w.step);
    const text = w.text.trim();
    if (!step || text === '') continue;
    // The opening line has nothing to arrive before, so it starts at zero.
    lines.push({ tStart: step.action === 'open' ? 0 : Math.max(0, step.tMs - leadMs), text });
  }
  return sortScript(lines);
}

/**
 * Bring an over-long line back within budget — but only at a sentence end.
 *
 * Chopping at the word count is how you get "AirSense monitors air quality
 * readings for." A line that runs a little long still reads; a truncated one
 * does not, and the timeline already flags and spaces overruns. So: drop
 * whole sentences if that fits, otherwise leave it alone and say so.
 */
export function fitToBudget(text: string, maxWords: number): string {
  const clean = text.trim();
  const count = (t: string): number => t.split(/\s+/).filter(Boolean).length;
  if (count(clean) <= maxWords) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (sentences) {
    let kept = '';
    for (const sentence of sentences) {
      const next = (kept + sentence).trim();
      if (count(next) > maxWords) break;
      kept = next;
    }
    if (kept) return kept;
  }
  return clean;
}

/**
 * Push lines just far enough apart that nothing talks over anything else,
 * keeping the first anchor where the author put it.
 *
 * Always run this on anything a writer produced. Even a writer told the word
 * budget lands the odd line long, and overlapping speech is the one flaw that
 * makes a narrated demo unusable.
 */
export function spaceOutScript(
  lines: readonly ScriptLine[],
  wpm = DEFAULT_VOICE.rate,
  gapMs = MIN_LINE_GAP_MS,
): ScriptLine[] {
  const sorted = sortScript(lines);
  let floor = 0;
  return sorted.map((l) => {
    const tStart = Math.max(l.tStart, floor);
    floor = tStart + lineDuration(l, wpm) + gapMs;
    return { ...l, tStart };
  });
}
