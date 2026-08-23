import { describe, expect, it } from 'vitest';
import { reconcileTimebase } from '../src/timebase.js';
import { SAMPLE } from './fixtures/sample-recording.js';

describe('reconcileTimebase', () => {
  it('leaves event times alone within tolerance but adopts the real duration', () => {
    const { rec, warning } = reconcileTimebase(SAMPLE, 15050);
    expect(warning).toBeUndefined();
    expect(rec.video.durationMs).toBe(15050);
    expect(rec.events.map((e) => e.t)).toEqual(SAMPLE.events.map((e) => e.t));
  });

  it('rescales and warns when drift exceeds tolerance', () => {
    const { rec, warning } = reconcileTimebase(SAMPLE, 16500); // 10% long
    expect(warning).toMatch(/drift/i);
    expect(rec.video.durationMs).toBe(16500);
    expect(rec.events[0]!.t).toBeCloseTo(1000 * 1.1, 6);
    expect(rec.events[rec.events.length - 1]!.t).toBeCloseTo(12000 * 1.1, 6);
  });

  it('warns and does nothing when the duration is unusable', () => {
    // MediaRecorder WebM reports Infinity until it has been seeked.
    for (const bad of [Infinity, NaN, 0, -1]) {
      const { rec, warning } = reconcileTimebase(SAMPLE, bad);
      expect(warning).toBeTruthy();
      expect(rec).toBe(SAMPLE);
    }
  });

  it('does not mutate the input recording', () => {
    const before = JSON.stringify(SAMPLE);
    reconcileTimebase(SAMPLE, 16500);
    expect(JSON.stringify(SAMPLE)).toBe(before);
  });
});
