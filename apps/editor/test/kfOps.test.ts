import { evaluateZoom, type DemoRecording, type ZoomKeyframe } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import {
  MIN_PILL_MS,
  applyDrag,
  freeSlotAt,
  insertZoom,
  setScale,
  snapWithin,
  type DragContext,
} from '../src/timeline/kfOps.js';

const DURATION = 14_000;

function kf(tStart: number, tEnd: number, x = 0.5, y = 0.5, scale = 1.8): ZoomKeyframe {
  return { tStart, tEnd, targetXNorm: x, targetYNorm: y, scale, easing: 'easeInOutCubic' };
}

const BASE: ZoomKeyframe[] = [kf(1000, 3000), kf(5000, 7000), kf(9000, 11_000)];

const ctx = (targets: number[] = [], tolerance = 0): DragContext => ({
  durationMs: DURATION,
  snapTargets: targets,
  tolerance,
});

/** The invariant every downstream consumer relies on. */
function assertOrdered(kfs: readonly ZoomKeyframe[]): void {
  for (let i = 0; i < kfs.length; i++) {
    expect(kfs[i]!.tEnd).toBeGreaterThan(kfs[i]!.tStart);
    expect(kfs[i]!.tStart).toBeGreaterThanOrEqual(0);
    expect(kfs[i]!.tEnd).toBeLessThanOrEqual(DURATION);
    if (i > 0) expect(kfs[i - 1]!.tEnd).toBeLessThanOrEqual(kfs[i]!.tStart);
  }
}

describe('applyDrag', () => {
  it('moves a pill and keeps its length', () => {
    const out = applyDrag(BASE, 1, 'move', 500, ctx());
    expect(out[1]).toMatchObject({ tStart: 5500, tEnd: 7500 });
    assertOrdered(out);
  });

  it('will not push a pill through its neighbours', () => {
    expect(applyDrag(BASE, 1, 'move', -9999, ctx())[1]).toMatchObject({
      tStart: 3000,
      tEnd: 5000,
    });
    expect(applyDrag(BASE, 1, 'move', 9999, ctx())[1]).toMatchObject({
      tStart: 7000,
      tEnd: 9000,
    });
  });

  it('keeps the first and last pill inside the video', () => {
    expect(applyDrag(BASE, 0, 'move', -9999, ctx())[0]!.tStart).toBe(0);
    expect(applyDrag(BASE, 2, 'move', 9999, ctx())[2]!.tEnd).toBe(DURATION);
  });

  it('resizes from either edge and never below MIN_PILL_MS', () => {
    expect(applyDrag(BASE, 1, 'start', -1000, ctx())[1]!.tStart).toBe(4000);
    expect(applyDrag(BASE, 1, 'end', 1000, ctx())[1]!.tEnd).toBe(8000);
    expect(applyDrag(BASE, 1, 'start', 9999, ctx())[1]!.tStart).toBe(7000 - MIN_PILL_MS);
    expect(applyDrag(BASE, 1, 'end', -9999, ctx())[1]!.tEnd).toBe(5000 + MIN_PILL_MS);
  });

  it('snaps an edge onto a nearby target', () => {
    // Dragging to 5040 with a click logged at 5000 and a 100ms tolerance.
    const out = applyDrag(BASE, 1, 'start', 40, ctx([5000, 8000], 100));
    expect(out[1]!.tStart).toBe(5000);
    // Outside the tolerance it stays exactly where it was dropped.
    expect(applyDrag(BASE, 1, 'start', 400, ctx([5000], 100))[1]!.tStart).toBe(5400);
  });

  it('snapping a pill flush against its neighbour chains the two zooms', () => {
    // Drop pill 1's start within tolerance of pill 0's end.
    const out = applyDrag(BASE, 1, 'move', -1990, ctx([3000], 100));
    expect(out[0]!.tEnd).toBe(out[1]!.tStart);
    assertOrdered(out);
    // evaluateZoom reads exact adjacency as "chained": pan, never drop to 1.0.
    for (let t = 3000; t <= 3600; t += 20) {
      expect(evaluateZoom(out, t).scale).toBeCloseTo(1.8, 6);
    }
  });

  it('keeps the array ordered under arbitrary drags', () => {
    for (const i of [0, 1, 2]) {
      for (const mode of ['move', 'start', 'end'] as const) {
        for (const d of [-20_000, -1500, -1, 0, 1, 1500, 20_000]) {
          assertOrdered(applyDrag(BASE, i, mode, d, ctx([0, 3000, 5000, DURATION], 50)));
        }
      }
    }
  });

  it('is a no-op for an index that is not there', () => {
    expect(applyDrag(BASE, 9, 'move', 500, ctx())).toEqual(BASE);
  });
});

describe('snapWithin', () => {
  it('converts a pixel tolerance into ms', () => {
    expect(snapWithin(0.1, 8)).toBe(80); // 0.1 px/ms -> 8px is 80ms
    expect(snapWithin(0)).toBe(0); // before the lane has been measured
  });
});

const REC: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: DURATION, width: 1280, height: 720, mime: 'video/webm' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    { t: 2000, type: 'click', xNorm: 0.3, yNorm: 0.3 },
    { t: 8000, type: 'click', xNorm: 0.65, yNorm: 0.7 },
  ],
};

describe('freeSlotAt', () => {
  it('refuses a point already covered by a pill', () => {
    expect(freeSlotAt(BASE, 2000, DURATION)).toBeNull();
  });
  it('returns the gap between neighbours', () => {
    expect(freeSlotAt(BASE, 4000, DURATION)).toEqual({ tStart: 3000, tEnd: 5000 });
    expect(freeSlotAt(BASE, 12_000, DURATION)).toEqual({ tStart: 11_000, tEnd: DURATION });
    expect(freeSlotAt(BASE, 500, DURATION)).toEqual({ tStart: 0, tEnd: 1000 });
  });
});

describe('insertZoom', () => {
  it('aims the new zoom at the nearest click, not the centre', () => {
    const out = insertZoom([], REC, 7800);
    expect(out).toHaveLength(1);
    expect(out[0]!.targetXNorm).toBeCloseTo(0.65, 6);
    expect(out[0]!.targetYNorm).toBeCloseTo(0.7, 6);
  });

  it('fits inside the free slot and keeps the array ordered', () => {
    const out = insertZoom(BASE, REC, 4000);
    expect(out).toHaveLength(4);
    assertOrdered(out);
    expect(out[1]!.tStart).toBeGreaterThanOrEqual(3000);
    expect(out[1]!.tEnd).toBeLessThanOrEqual(5000);
  });

  it('does nothing when the playhead is already inside a zoom', () => {
    expect(insertZoom(BASE, REC, 2000)).toEqual(BASE);
  });

  it('centres the zoom when the log has no clicks at all', () => {
    const bare = { ...REC, events: [] };
    const out = insertZoom([], bare, 5000);
    expect(out[0]!.targetXNorm).toBe(0.5);
    expect(out[0]!.targetYNorm).toBe(0.5);
  });
});

describe('setScale', () => {
  it('does not drift the target when the scale goes up and back down', () => {
    // A target hard against the edge: re-clamping on every change would eat it.
    const edge = [kf(1000, 3000, 0.95, 0.5, 1.2)];
    const up = setScale(edge, 0, 3);
    const back = setScale(up, 0, 1.2);
    expect(back[0]!.targetXNorm).toBe(0.95);
    expect(back[0]!.scale).toBe(1.2);
  });
});
