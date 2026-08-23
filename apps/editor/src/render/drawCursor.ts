/**
 * The synthetic cursor.
 *
 * We draw this ourselves instead of relying on a captured OS cursor. tabCapture
 * does not record one, and in Phase 3 Playwright never moves one — so deriving
 * it from the click log is the only thing that works everywhere, and it lets us
 * smooth the motion and add a click pulse for free.
 */

import type { CursorState } from '@demoforge/core';
import type { Stage } from './geometry.js';

/** Cursor height as a fraction of the output height. Constant on screen: a
 *  real pointer does not grow when the view zooms in. */
const SIZE_RATIO = 0.045;

/** Classic arrow, as a unit path 0..1 tall, drawn from its tip. */
const ARROW: Array<[number, number]> = [
  [0, 0],
  [0, 0.72],
  [0.19, 0.55],
  [0.3, 0.83],
  [0.43, 0.77],
  [0.32, 0.5],
  [0.56, 0.48],
];

export function drawCursor(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  outH: number,
  cursor: CursorState,
): void {
  // Callers draw inside the frame's clip path, so a cursor panned off the
  // visible area is hidden for free.
  const { x, y } = stage.toStage(cursor.xNorm, cursor.yNorm);
  const size = outH * SIZE_RATIO;

  ctx.save();

  if (cursor.clickPulse > 0) {
    const p = cursor.clickPulse;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.35 + (1 - p) * 1.1), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${p * 0.85})`;
    ctx.lineWidth = size * 0.12;
    ctx.stroke();
  }

  // A small dip on click, so the press reads even without the ring.
  const press = 1 - cursor.clickPulse * 0.12;
  ctx.translate(x, y);
  ctx.scale(size * press, size * press);

  ctx.beginPath();
  ctx.moveTo(ARROW[0]![0], ARROW[0]![1]);
  for (const [px, py] of ARROW.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 0.25;
  ctx.shadowOffsetY = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 0.06;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.stroke();

  ctx.restore();
}
