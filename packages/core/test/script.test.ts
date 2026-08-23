import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE,
  MIN_LINE_GAP_MS,
  estimateSpeechMs,
  lineDuration,
  scriptFromClicks,
  scriptOverruns,
  scriptSlotAt,
  sortScript,
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
