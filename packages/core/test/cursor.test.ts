import { describe, expect, it } from 'vitest';
import { DEFAULT_CURSOR_CONFIG, cursorAt } from '../src/cursor.js';
import { SAMPLE } from './fixtures/sample-recording.js';

const C = DEFAULT_CURSOR_CONFIG;

describe('cursorAt', () => {
  it('starts centred and lands exactly on each click at its click time', () => {
    expect(cursorAt(SAMPLE, 0)).toMatchObject({ xNorm: 0.5, yNorm: 0.5 });
    const s = cursorAt(SAMPLE, 1000);
    expect(s.xNorm).toBeCloseTo(0.42, 6);
    expect(s.yNorm).toBeCloseTo(0.31, 6);
  });

  it('visits every click, including ones the planner skipped', () => {
    // The giant-element click at t=6000 gets no zoom but the cursor still goes there.
    expect(cursorAt(SAMPLE, 6000).xNorm).toBeCloseTo(0.5, 6);
    expect(cursorAt(SAMPLE, 9000).xNorm).toBeCloseTo(0.05, 6);
  });

  it('dwells at the previous point instead of drifting the whole gap', () => {
    // 5s gap between t=1000 and t=6000; at t=3000 (well before departure) it is parked.
    // Note: t=3000/3150 are themselves clicks, so check the 9000->12000 gap.
    const parked = cursorAt(SAMPLE, 10000);
    expect(parked.xNorm).toBeCloseTo(0.05, 6);
    expect(parked.yNorm).toBeCloseTo(0.95, 6);
  });

  it('travels over moveMs into the next click', () => {
    const mid = cursorAt(SAMPLE, 12000 - C.moveMs / 2);
    expect(mid.xNorm).toBeGreaterThan(0.05);
    expect(mid.xNorm).toBeLessThan(0.88);
  });

  it('moves smoothly with no jumps', () => {
    let prev = cursorAt(SAMPLE, 0);
    for (let t = 1; t <= 15000; t += 1) {
      const s = cursorAt(SAMPLE, t);
      expect(Math.hypot(s.xNorm - prev.xNorm, s.yNorm - prev.yNorm)).toBeLessThan(0.02);
      prev = s;
    }
  });

  it('pulses on click and decays to zero', () => {
    expect(cursorAt(SAMPLE, 1000).clickPulse).toBeCloseTo(1, 6);
    expect(cursorAt(SAMPLE, 1000 + C.pulseMs / 2).clickPulse).toBeCloseTo(0.5, 6);
    expect(cursorAt(SAMPLE, 1000 + C.pulseMs).clickPulse).toBe(0);
    expect(cursorAt(SAMPLE, 1500).clickPulse).toBe(0);
  });

  it('holds on the last click after the final event', () => {
    expect(cursorAt(SAMPLE, 14999).xNorm).toBeCloseTo(0.88, 6);
  });
});
