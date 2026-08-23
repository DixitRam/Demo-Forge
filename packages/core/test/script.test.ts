import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE,
  MIN_LINE_GAP_MS,
  estimateSpeechMs,
  lineDuration,
  scriptFromClicks,
  scriptOverruns,
  scriptSlotAt,
  scriptFromSteps,
  scriptSteps,
  sortScript,
  wordBudget,
  type ScriptLine,
} from '../src/script.js';
import { SAMPLE } from './fixtures/sample-recording.js';

describe('speech length', () => {
  it('scales with word count and inversely with rate', () => {
    const six = 'one two three four five six';
    expect(estimateSpeechMs(six, 180)).toBe(2000);
    expect(estimateSpeechMs(six, 90)).toBe(4000);
    expect(estimateSpeechMs('   ')).toBe(0);
  });

  it('prefers a measured length over the estimate', () => {
    const line: ScriptLine = { tStart: 0, text: 'one two three', audioMs: 9999 };
    expect(lineDuration(line)).toBe(9999);
    expect(lineDuration({ tStart: 0, text: 'one two three' })).toBe(
      estimateSpeechMs('one two three', DEFAULT_VOICE.rate),
    );
  });
});

describe('overruns', () => {
  const long = 'one two three four five six seven eight nine ten eleven twelve';

  it('flags a line that talks over the next one', () => {
    const lines = [
      { tStart: 0, text: long }, // 4s at 180wpm
      { tStart: 2000, text: 'short' },
    ];
    expect(scriptOverruns(lines, 30_000, 180)).toEqual([0]);
  });

  it('is quiet when the lines fit', () => {
    const lines = [
      { tStart: 0, text: long },
      { tStart: 8000, text: 'short' },
    ];
    expect(scriptOverruns(lines, 30_000, 180)).toEqual([]);
  });

  it('flags a last line that runs past the end of the demo', () => {
    expect(scriptOverruns([{ tStart: 9000, text: long }], 10_000, 180)).toEqual([0]);
  });

  it('counts the gap as part of the overrun', () => {
    // Ends at exactly the next start — still too tight to be listenable.
    const lines = [
      { tStart: 0, text: long },
      { tStart: 4000, text: 'short' },
    ];
    expect(scriptOverruns(lines, 30_000, 180)).toEqual([0]);
    expect(scriptOverruns([lines[0]!, { ...lines[1]!, tStart: 4000 + MIN_LINE_GAP_MS }], 30_000, 180)).toEqual([]);
  });
});

describe('slots', () => {
  const lines = [{ tStart: 5000, text: 'one two three', audioMs: 2000 }];

  it('refuses a slot inside a line that is still being spoken', () => {
    expect(scriptSlotAt(lines, 6000, 20_000)).toBe(false);
    expect(scriptSlotAt(lines, 7100, 20_000)).toBe(true);
  });

  it('refuses a slot outside the recording', () => {
    expect(scriptSlotAt(lines, -1, 20_000)).toBe(false);
    expect(scriptSlotAt(lines, 20_000, 20_000)).toBe(false);
  });
});

describe('drafting from the click log', () => {
  const lines = scriptFromClicks(SAMPLE);

  it('leads each click so the words land before the action', () => {
    // First click is at t=1000, lead 700.
    expect(lines[0]!.tStart).toBe(300);
    expect(lines[0]!.text).toContain('button @1000');
  });

  it('drops the intro when the first step starts too soon to say it', () => {
    expect(lines.some((l) => /walkthrough/i.test(l.text))).toBe(false);
  });

  it('opens with an intro when there is room for one', () => {
    const late = scriptFromClicks({
      ...SAMPLE,
      events: SAMPLE.events.map((e) => ({ ...e, t: e.t + 8000 })),
    });
    expect(late[0]!.tStart).toBe(0);
    expect(late[0]!.text).toMatch(/walkthrough/i);
  });

  it('merges a rapid double-click into one sentence', () => {
    // t=3000 and t=3150 are the same anchor text.
    expect(lines.filter((l) => l.text.includes('a @3'))).toHaveLength(1);
  });

  it('names input elements differently from buttons', () => {
    expect(lines.some((l) => /enter your/i.test(l.text))).toBe(true);
  });

  it('never drafts lines that talk over each other', () => {
    expect(scriptOverruns(lines, SAMPLE.video.durationMs)).toEqual([]);
  });

  it('is time-ordered', () => {
    expect(lines).toEqual(sortScript(lines));
  });

  it('says something even for a log with no clicks', () => {
    const empty = scriptFromClicks({ ...SAMPLE, events: [] });
    expect(empty).toHaveLength(1);
  });
});

describe('scriptSteps', () => {
  const steps = scriptSteps(SAMPLE, 180);

  it('opens with an establishing step before any click', () => {
    expect(steps[0]).toMatchObject({ index: 0, tMs: 0, action: 'open' });
    expect(steps[0]!.text).toBeUndefined();
  });

  it('carries what was clicked, and where', () => {
    expect(steps[1]).toMatchObject({
      tMs: 1000,
      action: 'click',
      tag: 'button',
      text: 'button @1000',
      xNorm: 0.42,
      yNorm: 0.31,
    });
  });

  it('merges a rapid double-click into one step, keeping the first moment', () => {
    // t=3000 and t=3150 are 150ms apart: one action, one thing to say.
    expect(steps.filter((s) => s.tMs === 3150)).toHaveLength(0);
    expect(steps.filter((s) => s.tMs === 3000)).toHaveLength(1);
  });

  it('has one step per merged click, plus the opening', () => {
    // SAMPLE has 6 clicks; the pair 150ms apart becomes one.
    expect(steps.map((s) => s.tMs)).toEqual([0, 1000, 3000, 6000, 9000, 12_000]);
  });

  it('gives each step the window until the next one needs describing', () => {
    expect(steps[0]!.windowMs).toBe(1000);
    expect(steps[1]!.windowMs).toBe(2000);
    // The last step runs to the end of the demo, not to the next click.
    expect(steps.at(-1)!.windowMs).toBe(SAMPLE.video.durationMs - steps.at(-1)!.tMs);
  });

  it('budgets words against the window and never asks for nothing', () => {
    // 2s at 180wpm with headroom: floor(2/60 * 180 * 0.85) = 5
    expect(wordBudget(2000, 180)).toBe(5);
    expect(wordBudget(0, 180)).toBe(3);
    expect(steps.every((s) => s.maxWords >= 3)).toBe(true);
  });

  it('paces to the configured speed', () => {
    expect(wordBudget(10_000, 90)).toBeLessThan(wordBudget(10_000, 180));
  });
});

describe('scriptFromSteps', () => {
  const steps = scriptSteps(SAMPLE);

  it('keeps the timing ours and the words the writers', () => {
    const lines = scriptFromSteps(
      steps,
      [
        { step: 0, text: 'Here is the dashboard.' },
        { step: 1, text: 'Open the filters.' },
      ],
      700,
    );
    expect(lines[0]).toEqual({ tStart: 0, text: 'Here is the dashboard.' });
    // Step 1 is the click at t=1000, led by 700ms.
    expect(lines[1]).toEqual({ tStart: 300, text: 'Open the filters.' });
  });

  it('ignores a step index the writer invented', () => {
    expect(scriptFromSteps(steps, [{ step: 999, text: 'nope' }])).toEqual([]);
  });

  it('drops an empty line rather than speaking silence', () => {
    expect(scriptFromSteps(steps, [{ step: 1, text: '   ' }])).toEqual([]);
  });

  it('returns lines in time order whatever order they were written in', () => {
    const lines = scriptFromSteps(steps, [
      { step: 2, text: 'second' },
      { step: 0, text: 'first' },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['first', 'second']);
  });
});
