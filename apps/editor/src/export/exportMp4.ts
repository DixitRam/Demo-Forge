/**
 * MP4 export via ffmpeg.wasm.
 *
 * TODO: server-side ffmpeg render. Encoding in wasm is the fastest way to a
 * working export with no backend, but it is single-threaded-slow and capped by
 * browser memory. Moving this to a server buys real speed, higher quality
 * presets, and (Phase 2) muxing an AI voiceover track.
 *
 * We render offline — seek, compose, encode, repeat — rather than recording
 * canvas.captureStream() in real time. It is slower but frame-exact: a
 * real-time capture silently drops frames whenever the tab is busy, which is
 * exactly when a long export is running.
 */

import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { CaptionCue, DemoRecording, ZoomKeyframe } from '@demoforge/core';
import { compose } from '../render/compose.js';
import { outputAspect, type FrameStyle } from '../render/style.js';

/** Cap the long edge; a 4K screen recording is not worth a 4K wasm encode. */
const MAX_LONG_EDGE = 1920;

// ponytail: every frame is held as a JPEG in the wasm filesystem until the
// encode runs, so peak memory is roughly frames x frame size — fine for a
// 30s demo at 30fps, tight for minutes at 60fps. The server-side render in
// the TODO above is the real fix; streaming frames into the encoder would be
// the in-browser one.

export interface ExportOptions {
  rec: DemoRecording;
  video: HTMLVideoElement;
  /** The original bundle file, so the audio track can be muxed back in. */
  media: Blob;
  keyframes: readonly ZoomKeyframe[];
  captions: readonly CaptionCue[];
  style: FrameStyle;
  fps: number;
  onProgress: (stage: string, ratio: number) => void;
  signal?: AbortSignal;
}

/**
 * Size the output frame for the chosen aspect, keeping the recording at its
 * native resolution inside it (so a 9:16 frame around a 16:9 capture adds
 * background rather than throwing away pixels), then cap the long edge.
 */
export function outputSize(
  videoW: number,
  videoH: number,
  style: FrameStyle,
): { w: number; h: number } {
  const aspect = outputAspect(style, videoW, videoH);
  const videoAspect = videoW / (videoH || 1);
  let w = aspect >= videoAspect ? videoH * aspect : videoW;
  let h = aspect >= videoAspect ? videoH : videoW / aspect;

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h));
  w *= scale;
  h *= scale;

  // H.264 needs even dimensions.
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(w), h: even(h) };
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = (): void => {
      video.removeEventListener('error', bad);
      resolve();
    };
    const bad = (): void => {
      video.removeEventListener('seeked', ok);
      reject(new Error('Seek failed while rendering.'));
    };
    video.addEventListener('seeked', ok, { once: true });
    video.addEventListener('error', bad, { once: true });
    video.currentTime = seconds;
  });
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode a frame.'))),
      'image/jpeg',
      0.92,
    );
  });
}

export async function exportMp4(o: ExportOptions): Promise<Blob> {
  const { rec, video, keyframes, captions, style, fps } = o;
  const { w, h } = outputSize(video.videoWidth, video.videoHeight, style);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context available.');

  const ffmpeg = new FFmpeg();
  o.onProgress('Loading encoder', 0);
  await ffmpeg.load({ coreURL, wasmURL });

  const wasPaused = video.paused;
  const resumeAt = video.currentTime;
  video.pause();

  const total = Math.max(1, Math.round((rec.video.durationMs / 1000) * fps));
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new Error('Export cancelled.');
      const t = (i / fps) * 1000;
      await seek(video, t / 1000);
      compose(ctx, w, h, { video, rec, keyframes, captions, t, style });
      const jpeg = await toJpeg(canvas);
      await ffmpeg.writeFile(`f${String(i).padStart(6, '0')}.jpg`, await fetchFile(jpeg));
      o.onProgress('Rendering frames', (i + 1) / total);
    }

    await ffmpeg.writeFile('source', await fetchFile(o.media));

    ffmpeg.on('progress', ({ progress }) => o.onProgress('Encoding', Math.min(1, progress)));
    o.onProgress('Encoding', 0);

    // `-map 1:a?` keeps the original audio when there is any and is a no-op
    // when there is not. Audio stays a separate track muxed at the end, never
    // an input to the zoom logic — which is what lets Phase 2 swap in an AI
    // voiceover without touching any of this.
    await ffmpeg.exec([
      '-framerate',
      String(fps),
      '-i',
      'f%06d.jpg',
      '-i',
      'source',
      '-map',
      '0:v',
      '-map',
      '1:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      // Deliberately no -shortest: it would truncate the video to the audio
      // track, and the video is what the demo actually is.
      'out.mp4',
    ]);

    const data = await ffmpeg.readFile('out.mp4');
    o.onProgress('Done', 1);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } finally {
    // Free the wasm heap whether we finished or bailed out.
    ffmpeg.terminate();
    video.currentTime = resumeAt;
    if (!wasPaused) void video.play();
  }
}
