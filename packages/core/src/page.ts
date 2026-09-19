/**
 * Where the page sits inside the captured video.
 *
 * tabCapture encodes at a fixed frame size and letterboxes the tab into it: a
 * 1920x999 viewport in a 1920x1080 stream gets a 40px black bar top and
 * bottom. Every stored coordinate is relative to the viewport, so mapping it
 * onto the whole frame puts zooms and the cursor up to a bar's height off.
 *
 * The fit is "contain, centred" — Chrome's behaviour. Only the viewport's
 * aspect matters; DPR scales both sides equally.
 */

import type { DemoViewport } from './types.js';

export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bars thinner than this are encoder rounding, not letterboxing. */
const MIN_BAR_PX = 2;

// ponytail: uses the viewport at capture start; a mid-take resize shifts the bars.
export function pageRect(viewport: DemoViewport, videoW: number, videoH: number): PageRect {
  const full = { x: 0, y: 0, w: videoW, h: videoH };
  if (!(viewport.w > 0 && viewport.h > 0 && videoW > 0 && videoH > 0)) return full;

  const fit = Math.min(videoW / viewport.w, videoH / viewport.h);
  const w = viewport.w * fit;
  const h = viewport.h * fit;
  if (videoW - w < MIN_BAR_PX && videoH - h < MIN_BAR_PX) return full;
  return { x: (videoW - w) / 2, y: (videoH - h) / 2, w, h };
}
