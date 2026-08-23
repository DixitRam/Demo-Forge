import { describe, expect, it } from 'vitest';
import { DEFAULT_ZOOM_CONFIG, clampTarget, planZooms } from '../src/zoom-planner.js';
import type { DemoRecording } from '../src/types.js';
import { SAMPLE, SAMPLE_OTHER_VIEWPORT } from './fixtures/sample-recording.js';

const C = DEFAULT_ZOOM_CONFIG;
const HALF = 0.5 / C.zoomScale; // 0.2777…

describe('planZooms', () => {
  const kfs = planZooms(SAMPLE);

  it('emits one keyframe per meaningful click cluster', () => {
    // 6 clicks -> double-click merged (5) -> giant element skipped (4)
    expect(kfs).toHaveLength(4);
  });

  it('ignores non-click events', () => {
    const noise: DemoRecording = {
      ...SAMPLE,
      events: SAMPLE.events.filter((e) => e.type !== 'click'),
    };
    expect(planZooms(noise)).toHaveLength(0);
  });

  it('merges a rapid double-click into a single keyframe', () => {
    // The 3000/3150 pair collapses to one, anchored on the LAST click.
    const merged = kfs.filter((k) => Math.abs(k.targetXNorm - 0.7) < 1e-9);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.tStart).toBe(3150 - C.transitionMs);
  });

  it('skips a click on an element larger than maxTargetAreaRatio', () => {
    // The t=6000 click covers 91% of the viewport.
    expect(kfs.some((k) => k.tStart <= 6000 && 6000 < k.tEnd)).toBe(false);
  });

  it('targets the clicked point and is fully zoomed AT the click', () => {
    const kf = kfs[0]!;
    expect(kf.targetXNorm).toBeCloseTo(0.42, 6);
    expect(kf.targetYNorm).toBeCloseTo(0.31, 6);
    expect(kf.tStart).toBe(1000 - C.transitionMs);
    expect(kf.scale).toBe(C.zoomScale);
  });

  it('clamps the pan box inside the video on both axes', () => {
    for (const kf of kfs) {
      expect(kf.targetXNorm).toBeGreaterThanOrEqual(HALF - 1e-9);
      expect(kf.targetXNorm).toBeLessThanOrEqual(1 - HALF + 1e-9);
      expect(kf.targetYNorm).toBeGreaterThanOrEqual(HALF - 1e-9);
      expect(kf.targetYNorm).toBeLessThanOrEqual(1 - HALF + 1e-9);
    }
    // (0.05, 0.95) and (0.88, 0.20) are outside the pannable range.
    expect(kfs[2]!.targetXNorm).toBeCloseTo(HALF, 6);
    expect(kfs[2]!.targetYNorm).toBeCloseTo(1 - HALF, 6);
    expect(kfs[3]!.targetXNorm).toBeCloseTo(1 - HALF, 6);
    expect(kfs[3]!.targetYNorm).toBeCloseTo(HALF, 6);
  });

  it('returns sorted, non-overlapping keyframes', () => {
    for (let i = 0; i < kfs.length - 1; i++) {
      expect(kfs[i]!.tStart).toBeLessThan(kfs[i]!.tEnd);
      expect(kfs[i]!.tEnd).toBeLessThanOrEqual(kfs[i + 1]!.tStart);
    }
  });

  it('cuts a hold short when the next zoom starts first', () => {
    // kf0 would run to 1000+1200+500=2700, but kf1 starts at 3150-500=2650.
    expect(kfs[0]!.tEnd).toBe(2650);
    expect(kfs[1]!.tStart).toBe(2650);
  });

  it('never plans past the end of the video', () => {
    const short: DemoRecording = { ...SAMPLE, video: { ...SAMPLE.video, durationMs: 9500 } };
    for (const kf of planZooms(short)) expect(kf.tEnd).toBeLessThanOrEqual(9500);
  });

  it('is independent of viewport size and DPR', () => {
    // Same normalised clicks, 1280x800 @1x instead of 1440x900 @2x.
    expect(planZooms(SAMPLE_OTHER_VIEWPORT)).toEqual(kfs);
  });

  it('honours config overrides with no magic numbers left inline', () => {
    const kf = planZooms(SAMPLE, { zoomScale: 3, holdMs: 100, transitionMs: 50 })[0]!;
    expect(kf.scale).toBe(3);
    expect(kf.tStart).toBe(950);
    expect(kf.tEnd).toBe(1150);
  });

  it('clamps t=0 clicks to a non-negative start', () => {
    const rec: DemoRecording = {
      ...SAMPLE,
      events: [{ t: 0, type: 'click', xNorm: 0.5, yNorm: 0.5, el: { tag: 'button', rect: { x: 0, y: 0, w: 10, h: 10 } } }],
    };
    expect(planZooms(rec)[0]!.tStart).toBe(0);
  });

  it('zooms to a click with no element info', () => {
    const rec: DemoRecording = { ...SAMPLE, events: [{ t: 1000, type: 'click', xNorm: 0.5, yNorm: 0.5 }] };
    expect(planZooms(rec)).toHaveLength(1);
  });
});

describe('clampTarget', () => {
  it('centres when there is nothing to pan', () => {
    expect(clampTarget(0.1, 1)).toBe(0.5);
    expect(clampTarget(0.9, 0.5)).toBe(0.5);
  });
  it('leaves interior targets alone', () => {
    expect(clampTarget(0.5, 2)).toBe(0.5);
    expect(clampTarget(0.4, 2)).toBe(0.4);
  });
});
