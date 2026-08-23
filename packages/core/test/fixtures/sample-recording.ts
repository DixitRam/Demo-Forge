import type { DemoEvent, DemoRecording } from '../../src/types.js';

const VIEWPORT = { w: 1440, h: 900, dpr: 2 };

function click(t: number, xNorm: number, yNorm: number, w: number, h: number, tag = 'button'): DemoEvent {
  return { t, type: 'click', xNorm, yNorm, el: { tag, text: `${tag} @${t}`, rect: { x: 0, y: 0, w, h } } };
}

/**
 * Hand-authored log: 6 clicks, one rapid double-click (t=3000/3150), one click
 * on a giant element (t=6000, ~91% of the viewport), one click hard against
 * the top-right corner (t=9000 / t=12000) to exercise pan clamping. Plus
 * non-click events that the planner must ignore.
 */
export const SAMPLE: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T10:00:00.000Z',
  video: { durationMs: 15000, width: 2880, height: 1800, mime: 'video/webm;codecs=vp9' },
  viewport: VIEWPORT,
  audioTrack: false,
  events: [
    click(1000, 0.42, 0.31, 120, 40),
    { t: 2000, type: 'scroll', xNorm: 0.5, yNorm: 0.5 },
    click(3000, 0.7, 0.55, 80, 24, 'a'),
    click(3150, 0.7, 0.55, 80, 24, 'a'), // rapid double-click, merges with above
    { t: 4000, type: 'input', xNorm: 0.3, yNorm: 0.4 },
    click(6000, 0.5, 0.5, 1440, 820, 'div'), // 91% of viewport -> no zoom
    { t: 7000, type: 'nav', xNorm: 0, yNorm: 0 },
    click(9000, 0.05, 0.95, 100, 36), // bottom-left corner -> clamped
    click(12000, 0.88, 0.2, 200, 32, 'input'), // top-right corner -> clamped
  ],
};

/** Same clicks, different viewport and DPR — used to prove DPR independence. */
export const SAMPLE_OTHER_VIEWPORT: DemoRecording = {
  ...SAMPLE,
  video: { ...SAMPLE.video, width: 1280, height: 800 },
  viewport: { w: 1280, h: 800, dpr: 1 },
  events: SAMPLE.events.map((e) =>
    e.el ? { ...e, el: { ...e.el, rect: { ...e.el.rect, w: e.el.rect.w * (1280 / 1440), h: e.el.rect.h * (800 / 900) } } } : e,
  ),
};
