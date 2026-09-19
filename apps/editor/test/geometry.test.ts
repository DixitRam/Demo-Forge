import { IDLE_ZOOM, evaluateZoom, pageRect, planZooms, type DemoRecording } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { stageGeometry } from '../src/render/geometry.js';

const OUT_W = 1280;
const OUT_H = 720;
const VID_W = 1280;
const VID_H = 720;
const PAD = 0.05;

const centre = (): { x: number; y: number } => ({ x: OUT_W / 2, y: OUT_H / 2 });

describe('stageGeometry', () => {
  it('letterboxes the video inside the padded box, aspect preserved', () => {
    const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, IDLE_ZOOM);
    expect(s.dw / s.dh).toBeCloseTo(VID_W / VID_H, 9);
    expect(s.dx + s.dw / 2).toBeCloseTo(OUT_W / 2, 9);
    expect(s.dy + s.dh / 2).toBeCloseTo(OUT_H / 2, 9);
    // Shorter side drives the padding: 0.05 * 720 = 36px top and bottom.
    expect(s.dy).toBeCloseTo(36, 9);
    expect(s.dh).toBeCloseTo(648, 9);
  });

  it('shows the whole frame when idle', () => {
    const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, IDLE_ZOOM);
    expect([s.sx, s.sy, s.sw, s.sh]).toEqual([0, 0, VID_W, VID_H]);
    expect(s.toStage(0.5, 0.5)).toEqual(centre());
  });

  it('puts the zoom target dead centre — the whole point of the feature', () => {
    for (const [x, y] of [
      [0.3, 0.3],
      [0.7, 0.35],
      [0.35, 0.7],
      [0.65, 0.65],
    ]) {
      const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, {
        scale: 1.8,
        xNorm: x!,
        yNorm: y!,
      });
      const p = s.toStage(x!, y!);
      expect(p.x).toBeCloseTo(OUT_W / 2, 6);
      expect(p.y).toBeCloseTo(OUT_H / 2, 6);
    }
  });

  it('never shows outside the video edges, even for an unclamped target', () => {
    const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, {
      scale: 1.8,
      xNorm: 0.02,
      yNorm: 0.99,
    });
    expect(s.sx).toBeGreaterThanOrEqual(0);
    expect(s.sy).toBeGreaterThanOrEqual(0);
    expect(s.sx + s.sw).toBeLessThanOrEqual(VID_W + 1e-9);
    expect(s.sy + s.sh).toBeLessThanOrEqual(VID_H + 1e-9);
  });

  it('lands on the same spot whatever the capture resolution or DPR', () => {
    // Identical normalised click; 1280x720 capture vs a 2880x1620 retina one.
    const a = stageGeometry(OUT_W, OUT_H, 1280, 720, PAD, { scale: 1.8, xNorm: 0.3, yNorm: 0.3 });
    const b = stageGeometry(OUT_W, OUT_H, 2880, 1620, PAD, { scale: 1.8, xNorm: 0.3, yNorm: 0.3 });
    expect(a.toStage(0.3, 0.3)).toEqual(b.toStage(0.3, 0.3));
    expect(a.toStage(0.9, 0.1).x).toBeCloseTo(b.toStage(0.9, 0.1).x, 9);
  });

  it('scales overlays with the zoom', () => {
    const idle = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, IDLE_ZOOM);
    const zoomed = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, {
      scale: 1.8,
      xNorm: 0.5,
      yNorm: 0.5,
    });
    expect(zoomed.pxScale / idle.pxScale).toBeCloseTo(1.8, 9);
  });
});

/** The fixture from scripts/make-fixture.sh, end to end through the real planner. */
const FIXTURE: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: 14000, width: 1280, height: 720, mime: 'video/webm;codecs=vp9' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    { t: 2000, type: 'click', xNorm: 0.3, yNorm: 0.3, el: { tag: 'button', rect: { x: 324, y: 176, w: 120, h: 80 } } },
    { t: 5000, type: 'click', xNorm: 0.7, yNorm: 0.35, el: { tag: 'button', rect: { x: 836, y: 212, w: 120, h: 80 } } },
    { t: 5120, type: 'click', xNorm: 0.7, yNorm: 0.35, el: { tag: 'button', rect: { x: 836, y: 212, w: 120, h: 80 } } },
    { t: 8000, type: 'click', xNorm: 0.35, yNorm: 0.7, el: { tag: 'button', rect: { x: 388, y: 464, w: 120, h: 80 } } },
    { t: 11000, type: 'click', xNorm: 0.65, yNorm: 0.65, el: { tag: 'button', rect: { x: 772, y: 428, w: 120, h: 80 } } },
    { t: 13000, type: 'click', xNorm: 0.5, yNorm: 0.5, el: { tag: 'div', rect: { x: 0, y: 10, w: 1280, h: 700 } } },
  ],
};

describe('planner -> geometry, end to end', () => {
  const kfs = planZooms(FIXTURE);

  it('plans one zoom per marker, double-click merged, giant panel skipped', () => {
    expect(kfs).toHaveLength(4);
  });

  it('centres each marker at its click time', () => {
    const markers: Array<[number, number, number]> = [
      [2000, 0.3, 0.3],
      [5120, 0.7, 0.35],
      [8000, 0.35, 0.7],
      [11000, 0.65, 0.65],
    ];
    for (const [t, x, y] of markers) {
      const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, evaluateZoom(kfs, t));
      const p = s.toStage(x, y);
      expect(p.x).toBeCloseTo(OUT_W / 2, 4);
      expect(p.y).toBeCloseTo(OUT_H / 2, 4);
    }
  });

  it('leaves the giant panel unzoomed and centred', () => {
    const s = stageGeometry(OUT_W, OUT_H, VID_W, VID_H, PAD, evaluateZoom(kfs, 13000));
    expect(s.sw).toBe(VID_W);
    expect(s.toStage(0.5, 0.5)).toEqual(centre());
  });
});

describe('stageGeometry on a letterboxed capture', () => {
  // 1920x999 tab in a 1920x1080 stream: 40.5px bars top and bottom.
  const page = pageRect({ w: 1920, h: 999, dpr: 1 }, 1920, 1080);

  it('draws only the page, never the bars', () => {
    const s = stageGeometry(1920, 1080, 1920, 1080, 0, IDLE_ZOOM, page);
    expect([s.sx, s.sy, s.sw, s.sh]).toEqual([0, 40.5, 1920, 999]);
  });

  it('puts a zoom target dead centre even near the top edge', () => {
    const z = { scale: 2, xNorm: 0.5, yNorm: 0.3 };
    const s = stageGeometry(1920, 1080, 1920, 1080, 0, z, page);
    const p = s.toStage(z.xNorm, z.yNorm);
    expect(p.x).toBeCloseTo(960, 6);
    expect(p.y).toBeCloseTo(s.dy + s.dh / 2, 6);
  });
});
