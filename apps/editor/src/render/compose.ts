/**
 * The compositor. Both the live preview and the MP4 exporter call this, so
 * what you see is exactly what gets encoded.
 *
 * It converts against the video's real decoded size. `rec.viewport` is used
 * only for its aspect, to find the page inside tabCapture's letterbox.
 * All the arithmetic lives in geometry.ts, where it is unit-tested.
 */

import {
  cursorAt,
  evaluateZoom,
  pageRect,
  type CaptionCue,
  type DemoRecording,
  type ZoomKeyframe,
} from '@demoforge/core';
import { drawBackground } from './drawBackground.js';
import { captionAt, drawCaption } from './drawCaptions.js';
import { drawCursor } from './drawCursor.js';
import { stageGeometry, type Stage } from './geometry.js';
import { cursorMoveMs, unit, type FrameStyle } from './style.js';

export interface ComposeOptions {
  /** The exporter seeks this same element frame by frame. */
  video: HTMLVideoElement;
  rec: DemoRecording;
  keyframes: readonly ZoomKeyframe[];
  captions?: readonly CaptionCue[];
  /** Playhead in ms, on the same clock as DemoEvent.t. */
  t: number;
  style: FrameStyle;
}

export function compose(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: ComposeOptions,
): Stage | null {
  drawBackground(ctx, w, h, o.style);

  const vw = o.video.videoWidth;
  const vh = o.video.videoHeight;
  if (!vw || !vh) return null;

  const zoom = evaluateZoom(o.keyframes, o.t);
  const stage = stageGeometry(w, h, vw, vh, o.style.padding, zoom, pageRect(o.rec.viewport, vw, vh));
  const u = unit(w, h);
  const radius = o.style.radius * u;

  // Drop shadow: a filled rounded rect behind the frame. Painted separately so
  // the shadow is not re-applied to every overlay drawn inside the clip.
  const sh = o.style.shadow;
  if (sh.alpha > 0 && (sh.blur > 0 || sh.y > 0)) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${sh.alpha})`;
    ctx.shadowBlur = sh.blur * u;
    ctx.shadowOffsetY = sh.y * u;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(stage.dx, stage.dy, stage.dw, stage.dh, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(stage.dx, stage.dy, stage.dw, stage.dh, radius);
  ctx.clip();
  if (o.video.readyState >= 2) {
    ctx.drawImage(
      o.video,
      stage.sx,
      stage.sy,
      stage.sw,
      stage.sh,
      stage.dx,
      stage.dy,
      stage.dw,
      stage.dh,
    );
  }
  // Inside the clip, so the cursor and its click ring cannot spill onto the
  // background frame.
  const cur = o.style.cursor;
  if (cur.show) {
    drawCursor(ctx, stage, h, cursorAt(o.rec, o.t, { moveMs: cursorMoveMs(cur.smoothing) }), cur);
  }
  ctx.restore();

  // Outside the clip and outside the zoom: a caption belongs to the viewer,
  // not to the picture.
  const cue = o.captions && captionAt(o.captions, o.t);
  if (cue) drawCaption(ctx, stage, h, cue, o.style.captions);

  return stage;
}
