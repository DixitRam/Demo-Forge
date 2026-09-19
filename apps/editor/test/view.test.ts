import { describe, expect, it } from 'vitest';
import {
  MIN_SPAN_MS,
  clampView,
  fullView,
  panView,
  revealTime,
  zoomView,
} from '../src/timeline/view.js';

const DUR = 100_000;

describe('timeline view', () => {
  it('starts showing the whole recording', () => {
    expect(fullView(DUR)).toEqual({ start: 0, end: DUR });
  });

  it('never scrolls past either end', () => {
    expect(clampView({ start: -5000, end: 5000 }, DUR).start).toBe(0);
    expect(clampView({ start: DUR - 100, end: DUR + 9000 }, DUR).end).toBe(DUR);
    expect(panView(fullView(DUR), DUR, 50_000)).toEqual({ start: 0, end: DUR });
  });

  it('will not zoom in past MIN_SPAN_MS or out past the recording', () => {
    const tiny = zoomView(fullView(DUR), DUR, 50_000, 0.00001);
    expect(tiny.end - tiny.start).toBe(MIN_SPAN_MS);
    const huge = zoomView({ start: 40_000, end: 41_000 }, DUR, 40_500, 1000);
    expect(huge).toEqual({ start: 0, end: DUR });
  });

  it('keeps the anchored moment under the pointer', () => {
    const before = { start: 20_000, end: 60_000 };
    const anchor = 30_000;
    const ratio = (anchor - before.start) / (before.end - before.start);
    const after = zoomView(before, DUR, anchor, 0.5);
    expect((anchor - after.start) / (after.end - after.start)).toBeCloseTo(ratio, 9);
  });

  it('drops the anchor only when clamping forces it', () => {
    // Zooming out at the very start cannot keep the ratio and stay in bounds.
    const after = zoomView({ start: 0, end: 10_000 }, DUR, 500, 4);
    expect(after.start).toBe(0);
    expect(after.end - after.start).toBe(40_000);
  });

  it('pans by whole milliseconds in both directions', () => {
    const v = { start: 20_000, end: 40_000 };
    expect(panView(v, DUR, 5000)).toEqual({ start: 25_000, end: 45_000 });
    expect(panView(v, DUR, -5000)).toEqual({ start: 15_000, end: 35_000 });
  });

  it('leaves the window alone while the playhead is comfortably inside it', () => {
    const v = { start: 20_000, end: 40_000 };
    expect(revealTime(v, DUR, 30_000)).toBe(v);
    expect(revealTime(v, DUR, 22_500)).toBe(v);
  });

  it('recentres when the playhead leaves the margin', () => {
    const v = { start: 20_000, end: 40_000 };
    const after = revealTime(v, DUR, 45_000);
    expect(after.start).toBeLessThan(45_000);
    expect(after.end).toBeGreaterThan(45_000);
    expect(after.end - after.start).toBe(20_000);
  });

  it('keeps the same object when the window is pinned and cannot move', () => {
    // The player calls this every frame; a fresh-but-equal view re-renders forever.
    const full = fullView(DUR);
    expect(revealTime(full, DUR, 100)).toBe(full);
    expect(revealTime(full, DUR, DUR - 100)).toBe(full);
  });
});
