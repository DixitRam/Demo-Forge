import { evaluateZoom, type DemoRecording, type ZoomKeyframe } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { focusBounds, focusRect, stageGeometry } from '../src/render/geometry.js';
import { applyDrag, resetFocus, setFocusMode, setTarget } from '../src/timeline/kfOps.js';

const DUR = 20_000;

const REC: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: DUR, width: 1280, height: 720, mime: 'video/webm' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    { t: 2000, type: 'click', xNorm: 0.3, yNorm: 0.3 },
    { t: 12_000, type: 'click', xNorm: 0.62, yNorm: 0.68 },
  ],
};

function kf(tStart: number, tEnd: number, focus?: 'auto' | 'manual'): ZoomKeyframe {
  const base: ZoomKeyframe = {
    tStart,
    tEnd,
    targetXNorm: 0.3,
    targetYNorm: 0.3,
    scale: 1.8,
    easing: 'easeInOutCubic',
  };
  return focus ? { ...base, focus } : base;
}

describe('focusRect', () => {
  it('is the actual crop window, so what is inside is what you get', () => {
    const r = focusRect(2, 0.5, 0.5);
    expect(r).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(focusRect(1, 0.5, 0.5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('stays inside the frame for an off-centre target', () => {
    const r = focusRect(1.8, 0.05, 0.98);
    expect(r.x).toBe(0);
    expect(r.y + r.h).toBeCloseTo(1, 9);
  });

  it('matches what the compositor will actually show', () => {
    // The rect the overlay draws must equal the source crop stageGeometry picks.
    const scale = 1.8;
    const target = { xNorm: 0.62, yNorm: 0.68 };
    const r = focusRect(scale, target.xNorm, target.yNorm);
    const s = stageGeometry(1280, 720, 1280, 720, 0, { scale, ...target });
    expect(r.x * 1280).toBeCloseTo(s.sx, 6);
    expect(r.w * 1280).toBeCloseTo(s.sw, 6);
    expect(r.y * 720).toBeCloseTo(s.sy, 6);
  });
});

describe('focusBounds', () => {
  it('is the range a centre can occupy without leaving the frame', () => {
    expect(focusBounds(2)).toEqual({ min: 0.25, max: 0.75 });
    expect(focusBounds(1)).toEqual({ min: 0.5, max: 0.5 });
  });
});

describe('manual focus', () => {
  it('placing a point marks the zoom manual and clamps it', () => {
    const out = setTarget([kf(1000, 4000)], 0, 0.99, 0.01);
    expect(out[0]!.focus).toBe('manual');
    const b = focusBounds(1.8);
    expect(out[0]!.targetXNorm).toBeCloseTo(b.max, 9);
    expect(out[0]!.targetYNorm).toBeCloseTo(b.min, 9);
  });

  it('a manually aimed zoom keeps its point when dragged along the timeline', () => {
    const base = [setTarget([kf(1000, 4000)], 0, 0.8, 0.2)[0]!];
    const moved = applyDrag(base, 0, 'move', 10_000, {
      durationMs: DUR,
      snapTargets: [],
      tolerance: 0,
      rec: REC,
    });
    expect(moved[0]!.targetXNorm).toBeCloseTo(base[0]!.targetXNorm, 9);
    expect(moved[0]!.targetYNorm).toBeCloseTo(base[0]!.targetYNorm, 9);
  });

  it('an auto zoom re-aims at whatever click it lands on', () => {
    const base = [kf(1500, 4700, 'auto')];
    const moved = applyDrag(base, 0, 'move', 10_000, {
      durationMs: DUR,
      snapTargets: [],
      tolerance: 0,
      rec: REC,
    });
    expect(moved[0]!.targetXNorm).toBeCloseTo(0.62, 6);
    expect(moved[0]!.targetYNorm).toBeCloseTo(0.68, 6);
  });

  it('leaves targets alone when no recording is supplied', () => {
    const base = [kf(1500, 4700, 'auto')];
    const moved = applyDrag(base, 0, 'move', 10_000, {
      durationMs: DUR,
      snapTargets: [],
      tolerance: 0,
    });
    expect(moved[0]!.targetXNorm).toBe(0.3);
  });

  it('reset hands the zoom back to the click log', () => {
    const manual = setTarget([kf(1500, 4700)], 0, 0.9, 0.9);
    const back = resetFocus(manual, 0, REC);
    expect(back[0]!.focus).toBe('auto');
    expect(back[0]!.targetXNorm).toBeCloseTo(0.3, 6);
  });

  it('switching the mode to auto re-aims, to manual only pins', () => {
    const manual = setTarget([kf(1500, 4700)], 0, 0.9, 0.9);
    expect(setFocusMode(manual, 0, 'auto', REC)[0]!.targetXNorm).toBeCloseTo(0.3, 6);
    const pinned = setFocusMode([kf(1500, 4700, 'auto')], 0, 'manual', REC);
    expect(pinned[0]!.focus).toBe('manual');
    expect(pinned[0]!.targetXNorm).toBe(0.3);
  });

  it('a manual target still drives the rendered zoom', () => {
    const kfs = setTarget([kf(1000, 5000)], 0, 0.7, 0.4);
    const z = evaluateZoom(kfs, 3000);
    expect(z.xNorm).toBeCloseTo(0.7, 6);
    expect(z.yNorm).toBeCloseTo(0.4, 6);
  });
});
