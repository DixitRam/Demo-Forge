/**
 * Asking a model to write the narration.
 *
 * The interesting half is here rather than on the server: a model can only
 * describe what it is shown, so this grabs a frame of the screen at each step
 * and rings the spot that was clicked. That is the difference between "click
 * Submit" and a line that names the panel the click opened.
 *
 * Frames are drawn from the same decoded video the preview uses, at a size
 * chosen for a vision model rather than for looking at.
 */

import { pageRect, type DemoViewport, type ScriptStep, type WrittenLine } from '@demoforge/core';
import { seek } from '../export/exportMp4.js';

const ENDPOINT = '/api/script';
/**
 * Real dashboards set labels at 12-14px. At 720 wide those turn to mush, so
 * frames go at 1280 — about four image tiles each, still fine for two dozen.
 */
const FRAME_W = 1280;
const FRAME_QUALITY = 0.8;

export interface WriterStatus {
  ok: boolean;
  model?: string;
  error?: string;
}

export async function scriptStatus(): Promise<WriterStatus> {
  try {
    const res = await fetch(ENDPOINT);
    return (await res.json()) as WriterStatus;
  } catch {
    return { ok: false, error: 'No script writer on this server.' };
  }
}

/**
 * The opening frame is often the tail of a page load, so it is taken a beat
 * in. Every other step is grabbed at the moment of the click itself, before
 * the UI has responded — that is the screen the viewer is being told about.
 */
export function frameTimeMs(step: ScriptStep): number {
  return step.action === 'open' ? Math.min(500, step.windowMs / 2) : step.tMs;
}

function markClick(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xNorm: number,
  yNorm: number,
): void {
  const r = Math.max(10, Math.min(w, h) * 0.035);
  ctx.save();
  ctx.strokeStyle = '#ff00d0';
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.beginPath();
  ctx.arc(xNorm * w, yNorm * h, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * A JPEG per step, base64, click ringed. Seeking is serial because a video
 * element has one playhead.
 */
export async function captureFrames(
  video: HTMLVideoElement,
  steps: readonly ScriptStep[],
  viewport: DemoViewport,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  // Only the page, not tabCapture's letterbox: click coordinates are relative to it.
  const page = pageRect(viewport, video.videoWidth, video.videoHeight);
  const scale = Math.min(1, FRAME_W / (page.w || FRAME_W));
  const w = Math.max(2, Math.round(page.w * scale));
  const h = Math.max(2, Math.round(page.h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Map();

  const wasPaused = video.paused;
  const resumeAt = video.currentTime;
  video.pause();

  const frames = new Map<number, string>();
  try {
    for (const [i, step] of steps.entries()) {
      await seek(video, frameTimeMs(step) / 1000);
      ctx.drawImage(video, page.x, page.y, page.w, page.h, 0, 0, w, h);
      if (step.xNorm !== undefined && step.yNorm !== undefined) {
        markClick(ctx, w, h, step.xNorm, step.yNorm);
      }
      // Strip the `data:image/jpeg;base64,` prefix; the server wants the bytes.
      frames.set(step.index, canvas.toDataURL('image/jpeg', FRAME_QUALITY).split(',')[1] ?? '');
      onProgress?.(i + 1, steps.length);
    }
  } finally {
    video.currentTime = resumeAt;
    if (!wasPaused) void video.play();
  }
  return frames;
}

export async function requestScript(
  steps: readonly ScriptStep[],
  frames: ReadonlyMap<number, string>,
  brief: string,
): Promise<WrittenLine[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brief,
      steps: steps.map((s) => ({ ...s, frame: frames.get(s.index) })),
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `The writer failed (${res.status}).`);
  }
  const body = (await res.json()) as { lines?: WrittenLine[] };
  return body.lines ?? [];
}
