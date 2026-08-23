import { describe, expect, it } from 'vitest';
import { IDLE_ZOOM, evaluateZoom } from '../src/zoom-eval.js';
import { DEFAULT_ZOOM_CONFIG, planZooms, type ZoomKeyframe } from '../src/zoom-planner.js';
import { SAMPLE } from './fixtures/sample-recording.js';

const C = DEFAULT_ZOOM_CONFIG;
const kfs = planZooms(SAMPLE);

describe('evaluateZoom', () => {
  it('is idle outside every keyframe', () => {
    expect(evaluateZoom(kfs, 0)).toEqual(IDLE_ZOOM);
    expect(evaluateZoom(kfs, 6000)).toEqual(IDLE_ZOOM); // the skipped giant click
    expect(evaluateZoom(kfs, 14000)).toEqual(IDLE_ZOOM);
    expect(evaluateZoom([], 1234)).toEqual(IDLE_ZOOM);
  });

  it('is fully zoomed on target at the moment of the click', () => {
    const s = evaluateZoom(kfs, 1000);
    expect(s.scale).toBeCloseTo(C.zoomScale, 6);
    expect(s.xNorm).toBeCloseTo(0.42, 6);
    expect(s.yNorm).toBeCloseTo(0.31, 6);
  });

  it('starts and ends an unchained keyframe at idle', () => {
    const kf = kfs[2]!; // 8500..10700, isolated
    expect(evaluateZoom(kfs, kf.tStart).scale).toBeCloseTo(1, 6);
    expect(evaluateZoom(kfs, kf.tEnd - 1e-9).scale).toBeCloseTo(1, 6);
    expect(evaluateZoom(kfs, kf.tStart + C.transitionMs / 2).scale).toBeGreaterThan(1);
  });

  it('pans between chained zooms without dropping back to 1.0', () => {
    // kf0.tEnd === kf1.tStart === 2650: the hold was cut short.
    for (let t = 1000; t <= 3300; t += 25) {
      expect(evaluateZoom(kfs, t).scale).toBeCloseTo(C.zoomScale, 6);
    }
  });

  it('is continuous across the chained boundary', () => {
    const a = evaluateZoom(kfs, 2650 - 1e-6);
    const b = evaluateZoom(kfs, 2650 + 1e-6);
    expect(b.xNorm).toBeCloseTo(a.xNorm, 6);
    expect(b.yNorm).toBeCloseTo(a.yNorm, 6);
    expect(b.scale).toBeCloseTo(a.scale, 6);
  });

  it('has no jumps anywhere in the timeline', () => {
    let prev = evaluateZoom(kfs, 0);
    for (let t = 1; t <= 15000; t += 1) {
      const s = evaluateZoom(kfs, t);
      expect(Math.abs(s.scale - prev.scale)).toBeLessThan(0.02);
      expect(Math.abs(s.xNorm - prev.xNorm)).toBeLessThan(0.02);
      expect(Math.abs(s.yNorm - prev.yNorm)).toBeLessThan(0.02);
      prev = s;
    }
  });

  it('halves the ramp rather than overshooting a short (user-resized) pill', () => {
    const tiny: ZoomKeyframe[] = [
      { tStart: 1000, tEnd: 1200, targetXNorm: 0.4, targetYNorm: 0.4, scale: 2, easing: 'easeInOutCubic' },
    ];
    expect(evaluateZoom(tiny, 1100).scale).toBeCloseTo(2, 6); // peak reached mid-pill
    expect(evaluateZoom(tiny, 1000).scale).toBeCloseTo(1, 6);
  });
});
