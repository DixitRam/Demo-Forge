/**
 * Captions, drawn over the frame but outside the zoom transform — a caption
 * belongs to the viewer, not to the picture, so it must not slide around or
 * change size when the camera zooms in.
 */

import type { CaptionCue, CaptionStyle } from '@demoforge/core';
import type { Stage } from './geometry.js';

/** Longest line, as a fraction of the frame width. */
const MAX_LINE = 0.82;

export function captionAt(captions: readonly CaptionCue[], t: number): CaptionCue | undefined {
  return captions.find((c) => t >= c.tStart && t < c.tEnd);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.filter((l) => l.length > 0);
}

export function drawCaption(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  outH: number,
  cue: CaptionCue,
  style: CaptionStyle,
): void {
  const fontPx = outH * style.size;
  if (fontPx < 1) return;

  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrap(ctx, cue.text, stage.dw * MAX_LINE);
  if (lines.length === 0) {
    ctx.restore();
    return;
  }

  const lineH = fontPx * 1.28;
  const padX = fontPx * 0.55;
  const padY = fontPx * 0.34;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const boxH = lines.length * lineH + padY * 2;

  const margin = fontPx * 0.7;
  const cx = stage.dx + stage.dw / 2;
  const top =
    style.position === 'top'
      ? stage.dy + margin
      : stage.dy + stage.dh - margin - boxH;

  if (style.background) {
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, top, boxW, boxH, fontPx * 0.28);
    ctx.fill();
  }

  ctx.fillStyle = style.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, top + padY + lineH * (i + 0.5));
  });

  ctx.restore();
}
