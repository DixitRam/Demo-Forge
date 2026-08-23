import { effectiveTrim, evaluateZoom, planZooms, type DemoRecording } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { frameTimes } from '../src/export/exportMp4.js';

const DUR = 14_000;

const REC: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: DUR, width: 1280, height: 720, mime: 'video/webm' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    { t: 2000, type: 'click', xNorm: 0.3, yNorm: 0.3 },
    { t: 8000, type: 'click', xNorm: 0.7, yNorm: 0.6 },
  ],
};

describe('frameTimes', () => {
  it('covers the whole recording when untrimmed', () => {
    const t = frameTimes(0, DUR, 30);
    expect(t).toHaveLength(420);
    expect(t[0]).toBe(0);
    expect(t.at(-1)).toBeCloseTo(DUR - 1000 / 30, 6);
  });

  it('starts at the in-point and is exactly the kept length', () => {
    const t = frameTimes(3000, 11_000, 30);
    expect(t[0]).toBe(3000);
    expect(t).toHaveLength(240); // 8s at 30fps
    expect(t.at(-1)).toBeLessThan(11_000);
  });

  it('stays in source time, so zoom timing needs no remapping', () => {
    // A zoom planned for the click at t=8000 must still be at full scale in
    // the frame rendered for source time 8000, whatever the in-point is.
    const kfs = planZooms(REC);
    for (const start of [0, 3000, 7000]) {
      const times = frameTimes(start, DUR, 30);
      const frame = times.find((t) => t >= 8000)!;
      expect(evaluateZoom(kfs, frame).scale).toBeCloseTo(1.8, 2);
    }
  });

  it('honours the frame rate', () => {
    expect(frameTimes(0, 1000, 24)).toHaveLength(24);
    expect(frameTimes(0, 1000, 60)).toHaveLength(60);
  });

  it('always emits at least one frame', () => {
    expect(frameTimes(5000, 5000, 30)).toHaveLength(1);
  });

  it('matches the span effectiveTrim reports', () => {
    const span = effectiveTrim({ startMs: 2500, endMs: 9500 }, DUR);
    const t = frameTimes(span.startMs, span.endMs, 30);
    expect(t).toHaveLength(210);
    expect(t[0]).toBe(2500);
  });
});
