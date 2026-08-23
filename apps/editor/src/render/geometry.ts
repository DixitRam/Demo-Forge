/**
 * Where the video lands on the output canvas, and where a normalised point
 * lands on top of it. Pure arithmetic — this is correctness risk #2 made
 * testable, and it is the ONE place 0..1 becomes pixels.
 */

import type { ZoomState } from '@demoforge/core';

export interface Stage {
  /** Destination rect of the video on the output canvas, in output px. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Visible source rect, in video px. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output px per video px — for scaling overlays with the zoom. */
  pxScale: number;
  toStage(xNorm: number, yNorm: number): { x: number; y: number };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function stageGeometry(
  outW: number,
  outH: number,
  videoW: number,
  videoH: number,
  padding: number,
  zoom: ZoomState,
): Stage {
  // Fit the video inside the padded box, preserving its aspect ratio.
  const pad = Math.min(outW, outH) * padding;
  const fit = Math.min((outW - pad * 2) / videoW, (outH - pad * 2) / videoH);
  const dw = videoW * fit;
  const dh = videoH * fit;
  const dx = (outW - dw) / 2;
  const dy = (outH - dh) / 2;

  // Zoom by cropping the source rect. The planner already clamped the target
  // in normalised space, but the decoded video's aspect can differ from the
  // capture viewport, so clamp again against real pixels.
  const sw = videoW / zoom.scale;
  const sh = videoH / zoom.scale;
  const sx = clamp(zoom.xNorm * videoW - sw / 2, 0, videoW - sw);
  const sy = clamp(zoom.yNorm * videoH - sh / 2, 0, videoH - sh);

  return {
    dx,
    dy,
    dw,
    dh,
    sx,
    sy,
    sw,
    sh,
    pxScale: dw / sw,
    toStage: (xNorm, yNorm) => ({
      x: dx + ((xNorm * videoW - sx) / sw) * dw,
      y: dy + ((yNorm * videoH - sy) / sh) * dh,
    }),
  };
}

/**
 * The crop window a zoom will show, in normalised video coordinates. Drawn on
 * the unzoomed preview so the user can see exactly what will be visible.
 */
export function focusRect(
  scale: number,
  xNorm: number,
  yNorm: number,
): { x: number; y: number; w: number; h: number } {
  const w = 1 / Math.max(1, scale);
  return {
    x: clamp(xNorm - w / 2, 0, 1 - w),
    y: clamp(yNorm - w / 2, 0, 1 - w),
    w,
    h: w,
  };
}

/** Range a focus centre may occupy at this scale without leaving the frame. */
export function focusBounds(scale: number): { min: number; max: number } {
  const half = 0.5 / Math.max(1, scale);
  return half >= 0.5 ? { min: 0.5, max: 0.5 } : { min: half, max: 1 - half };
}
