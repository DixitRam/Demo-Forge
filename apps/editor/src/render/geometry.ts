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
