import { describe, expect, it } from 'vitest';
import { pageRect } from '../src/page.js';

describe('pageRect', () => {
  it('finds the letterbox bars on a short viewport', () => {
    // The real recording: 1920x999 tab in a 1920x1080 stream, bars at 40.5px.
    const r = pageRect({ w: 1920, h: 999, dpr: 1 }, 1920, 1080);
    expect(r).toEqual({ x: 0, y: 40.5, w: 1920, h: 999 });
  });

  it('pillarboxes a tall viewport', () => {
    const r = pageRect({ w: 1000, h: 1000, dpr: 2 }, 1920, 1080);
    expect(r).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
  });

  it('is the whole frame when aspects match, at any scale or DPR', () => {
    expect(pageRect({ w: 1280, h: 720, dpr: 2 }, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('ignores rounding-sized bars and a missing viewport', () => {
    expect(pageRect({ w: 1920, h: 1079, dpr: 1 }, 1920, 1080).y).toBe(0);
    expect(pageRect({ w: 0, h: 0, dpr: 1 }, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});
