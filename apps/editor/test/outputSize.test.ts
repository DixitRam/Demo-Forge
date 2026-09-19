import { describe, expect, it } from 'vitest';
import { outputSize } from '../src/export/plan.js';
import { DEFAULT_STYLE, type FrameStyle } from '../src/render/style.js';

const withAspect = (aspect: number | null): FrameStyle => ({ ...DEFAULT_STYLE, aspect });

describe('outputSize', () => {
  it('keeps the recording resolution when the aspect is Original', () => {
    expect(outputSize(1280, 720, withAspect(null))).toEqual({ w: 1280, h: 720 });
  });

  it('always returns even dimensions, which H.264 requires', () => {
    for (const [w, h] of [
      [1366, 769],
      [1279, 721],
      [2879, 1801],
    ]) {
      const out = outputSize(w!, h!, withAspect(null));
      expect(out.w % 2).toBe(0);
      expect(out.h % 2).toBe(0);
    }
  });

  it('caps the long edge instead of encoding 4K in wasm', () => {
    const out = outputSize(3840, 2160, withAspect(null));
    expect(Math.max(out.w, out.h)).toBeLessThanOrEqual(1920);
    expect(out.w / out.h).toBeCloseTo(16 / 9, 2);
  });

  it('adds background rather than cropping when the frame is taller', () => {
    // 9:16 around a 16:9 capture keeps the full width at native resolution.
    const out = outputSize(1280, 720, withAspect(9 / 16));
    expect(out.w).toBe(1080);
    expect(out.h).toBe(1920);
    expect(out.w / out.h).toBeCloseTo(9 / 16, 3);
  });

  it('honours a square frame', () => {
    const out = outputSize(1280, 720, withAspect(1));
    expect(out.w).toBe(out.h);
  });
});
