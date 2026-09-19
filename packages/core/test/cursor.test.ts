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

  it('dwells near the previous point instead of travelling the whole gap', () => {
    // Check the 9000->12000 gap: parked, with only a few pixels of idle drift.
    const parked = cursorAt(SAMPLE, 10000);
    expect(Math.abs(parked.xNorm - 0.05)).toBeLessThan(0.006);
    expect(Math.abs(parked.yNorm - 0.95)).toBeLessThan(0.006);
  });

  it('drifts while parked instead of freezing', () => {
    const a = cursorAt(SAMPLE, 10000);
    const b = cursorAt(SAMPLE, 10500);
    expect(Math.hypot(a.xNorm - b.xNorm, a.yNorm - b.yNorm)).toBeGreaterThan(0.0002);
  });

  it('travels on an arc, not a straight line', () => {
    // Midway from (0.05,0.95) to (0.88,y) the point sits off the chord.
    const from = cursorAt(SAMPLE, 11000);
    const to = cursorAt(SAMPLE, 12000);
    const mid = cursorAt(SAMPLE, 12000 - 250);
    const cross = (to.xNorm - from.xNorm) * (mid.yNorm - from.yNorm) - (to.yNorm - from.yNorm) * (mid.xNorm - from.xNorm);
    expect(Math.abs(cross)).toBeGreaterThan(0.001);
  });

  it('visits hover moves without a click pulse', () => {
    const rec = { ...SAMPLE, events: [...SAMPLE.events, { t: 7500, type: 'move' as const, xNorm: 0.7, yNorm: 0.2 }] };
    const s = cursorAt(rec, 7500);
    expect(s.xNorm).toBeCloseTo(0.7, 6);
    expect(s.yNorm).toBeCloseTo(0.2, 6);
    expect(s.clickPulse).toBe(0);
  });

  it('travels into the next click, overshooting at most slightly', () => {
    const mid = cursorAt(SAMPLE, 12000 - C.moveMs / 2);
    expect(mid.xNorm).toBeGreaterThan(0.05);
    expect(mid.xNorm).toBeLessThan(0.88 + 0.02);
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
    expect(Math.abs(cursorAt(SAMPLE, 14999).xNorm - 0.88)).toBeLessThan(0.006);
  });
});
