import { MIN_LINE_GAP_MS, scriptOverruns, sortScript } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import {
  deleteLine,
  insertLine,
  moveLine,
  setLineText,
  spaceOutScript,
} from '../src/timeline/scriptOps.js';

const LINES = [
  { tStart: 1000, text: 'one two three', audioMs: 1200 },
  { tStart: 5000, text: 'four five six', audioMs: 1200 },
];

describe('script edits', () => {
  it('keeps the list time-ordered when inserting', () => {
    const next = insertLine(LINES, 3000, 20_000, 'middle');
    expect(next.map((l) => l.tStart)).toEqual([1000, 3000, 5000]);
    expect(next).toEqual(sortScript(next));
  });

  it('clamps an insert to the recording', () => {
    expect(insertLine(LINES, -5000, 20_000)[0]!.tStart).toBe(0);
    expect(insertLine(LINES, 99_000, 20_000).at(-1)!.tStart).toBe(20_000);
  });

  it('moves a line without letting it leave the recording', () => {
    expect(moveLine(LINES, 0, -9000, 20_000)[0]!.tStart).toBe(0);
    expect(moveLine(LINES, 1, 500, 20_000)[1]!.tStart).toBe(5500);
  });

  it('drops the measured length when the words change', () => {
    const next = setLineText(LINES, 0, 'completely different');
    expect(next[0]!.audioMs).toBeUndefined();
    expect(next[0]!.text).toBe('completely different');
    // The untouched line keeps its measurement.
    expect(next[1]!.audioMs).toBe(1200);
  });

  it('deletes by index', () => {
    expect(deleteLine(LINES, 0)).toEqual([LINES[1]]);
  });
});

describe('spaceOutScript', () => {
  it('resolves every overrun and keeps the first anchor', () => {
    const crowded = [
      { tStart: 2000, text: 'one two three', audioMs: 3000 },
      { tStart: 2500, text: 'four five six', audioMs: 3000 },
      { tStart: 3000, text: 'seven eight', audioMs: 1000 },
    ];
    const fixed = spaceOutScript(crowded, 170, MIN_LINE_GAP_MS);
    expect(fixed[0]!.tStart).toBe(2000);
    expect(scriptOverruns(fixed, 60_000)).toEqual([]);
  });

  it('leaves a script that already fits alone', () => {
    expect(spaceOutScript(LINES, 170, MIN_LINE_GAP_MS)).toEqual(LINES);
  });
});
