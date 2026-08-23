import { describe, expect, it } from 'vitest';
import {
  MIN_CUT_MS,
  cutAt,
  cutDuration,
  editedDuration,
  editedToSource,
  keptSegments,
  normalizeCuts,
  skipTarget,
  sourceToEdited,
  type CutRegion,
} from '../src/edits.js';

const DUR = 100_000;
const CUTS: CutRegion[] = [
  { tStart: 10_000, tEnd: 20_000 },
  { tStart: 50_000, tEnd: 55_000 },
];

describe('normalizeCuts', () => {
  it('sorts, clamps and drops mis-drags', () => {
    const out = normalizeCuts(
      [
        { tStart: 50_000, tEnd: 55_000 },
        { tStart: -5000, tEnd: 3000 },
        { tStart: 70_000, tEnd: 70_010 }, // under MIN_CUT_MS
        { tStart: 90_000, tEnd: 999_999 },
      ],
      DUR,
    );
    expect(out).toEqual([
      { tStart: 0, tEnd: 3000 },
      { tStart: 50_000, tEnd: 55_000 },
      { tStart: 90_000, tEnd: DUR },
    ]);
  });

  it('repairs an inverted span rather than dropping it', () => {
    expect(normalizeCuts([{ tStart: 8000, tEnd: 2000 }], DUR)).toEqual([
      { tStart: 2000, tEnd: 8000 },
    ]);
  });

  it('merges overlapping and touching cuts', () => {
    expect(
      normalizeCuts(
        [
          { tStart: 1000, tEnd: 5000 },
          { tStart: 4000, tEnd: 9000 },
          { tStart: 9000, tEnd: 12_000 },
        ],
        DUR,
      ),
    ).toEqual([{ tStart: 1000, tEnd: 12_000 }]);
  });
});

describe('keptSegments', () => {
  it('is the whole recording when nothing is cut', () => {
    expect(keptSegments([], DUR)).toEqual([{ start: 0, end: DUR, editedStart: 0 }]);
  });

  it('lays the survivors end to end in edited time', () => {
    expect(keptSegments(CUTS, DUR)).toEqual([
      { start: 0, end: 10_000, editedStart: 0 },
      { start: 20_000, end: 50_000, editedStart: 10_000 },
      { start: 55_000, end: DUR, editedStart: 40_000 },
    ]);
  });

  it('handles cuts at the very head and tail', () => {
    const segs = keptSegments(
      [
        { tStart: 0, tEnd: 5000 },
        { tStart: 95_000, tEnd: DUR },
      ],
      DUR,
    );
    expect(segs).toEqual([{ start: 5000, end: 95_000, editedStart: 0 }]);
  });

  it('never returns nothing, even if everything is cut', () => {
    const segs = keptSegments([{ tStart: 0, tEnd: DUR }], DUR);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.end).toBeGreaterThan(segs[0]!.start);
  });
});

describe('durations', () => {
  it('reports what the demo actually runs for', () => {
    expect(editedDuration([], DUR)).toBe(DUR);
    expect(editedDuration(CUTS, DUR)).toBe(DUR - 15_000);
    expect(cutDuration(CUTS)).toBe(15_000);
  });
});

describe('time mapping', () => {
  it('is the identity with no cuts', () => {
    for (const t of [0, 1234, 50_000, DUR]) {
      expect(sourceToEdited([], DUR, t)).toBe(t);
      expect(editedToSource([], DUR, t)).toBe(t);
    }
  });

  it('shifts source time back by everything cut before it', () => {
    expect(sourceToEdited(CUTS, DUR, 5000)).toBe(5000);
    expect(sourceToEdited(CUTS, DUR, 30_000)).toBe(20_000);
    expect(sourceToEdited(CUTS, DUR, 60_000)).toBe(45_000);
  });

  it('collapses a moment inside a cut onto the seam', () => {
    expect(sourceToEdited(CUTS, DUR, 12_000)).toBe(10_000);
    expect(sourceToEdited(CUTS, DUR, 19_999)).toBe(10_000);
  });

  it('round-trips on kept ground', () => {
    for (const t of [0, 5000, 20_000, 35_000, 55_000, 80_000]) {
      expect(editedToSource(CUTS, DUR, sourceToEdited(CUTS, DUR, t))).toBeCloseTo(t, 6);
    }
  });

  it('jumps the source across the seam as edited time crosses it', () => {
    expect(editedToSource(CUTS, DUR, 9999)).toBeCloseTo(9999, 6);
    expect(editedToSource(CUTS, DUR, 10_000)).toBe(20_000);
    expect(editedToSource(CUTS, DUR, 40_000)).toBe(55_000);
  });

  it('is monotonic across the whole edited timeline', () => {
    let prev = -1;
    for (let e = 0; e <= editedDuration(CUTS, DUR); e += 250) {
      const t = editedToSource(CUTS, DUR, e);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('never maps past the end of the recording', () => {
    expect(editedToSource(CUTS, DUR, 999_999)).toBeLessThanOrEqual(DUR);
    expect(sourceToEdited(CUTS, DUR, 999_999)).toBeLessThanOrEqual(editedDuration(CUTS, DUR));
  });
});

describe('playback skipping', () => {
  it('reports nothing to do on kept ground', () => {
    expect(skipTarget(CUTS, DUR, 5000)).toBeNull();
    expect(cutAt(CUTS, 5000)).toBeUndefined();
  });

  it('sends the playhead to the far side of the cut it fell into', () => {
    expect(skipTarget(CUTS, DUR, 10_000)).toBe(20_000);
    expect(skipTarget(CUTS, DUR, 19_999)).toBe(20_000);
    expect(cutAt(CUTS, 12_000)).toEqual(CUTS[0]);
  });

  it('treats the moment a cut ends as kept, not cut', () => {
    expect(skipTarget(CUTS, DUR, 20_000)).toBeNull();
  });

  it('stops at the recording end when the tail is cut', () => {
    expect(skipTarget([{ tStart: 90_000, tEnd: DUR }], DUR, 95_000)).toBe(DUR);
  });
});

describe('MIN_CUT_MS', () => {
  it('is the floor for a real cut', () => {
    expect(normalizeCuts([{ tStart: 0, tEnd: MIN_CUT_MS - 1 }], DUR)).toEqual([]);
    expect(normalizeCuts([{ tStart: 0, tEnd: MIN_CUT_MS }], DUR)).toHaveLength(1);
  });
});
