/**
 * MP4 export via ffmpeg.wasm — the fallback. When the dev server is running,
 * the Export dialog uses native ffmpeg instead (vite-export.ts, ~4x faster);
 * this path is for a static build with no server.
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
import {
  type CaptionCue,
  type CutRegion,
  type DemoRecording,
  type VoiceStyle,
  type ZoomKeyframe,
} from '@demoforge/core';
import { compose } from '../render/compose.js';
import type { FrameStyle } from '../render/style.js';
import { frameTimes, mixFilter, outputSize } from './plan.js';

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
  /** Narration mixdown in SOURCE time, or null. Spliced like the tab audio. */
  narration: Blob | null;
  voice: VoiceStyle;
  keyframes: readonly ZoomKeyframe[];
  captions: readonly CaptionCue[];
  cuts: readonly CutRegion[];
  style: FrameStyle;
  fps: number;
  onProgress: (stage: string, ratio: number) => void;
  signal?: AbortSignal;
}

/** Shared with the script writer, which seeks the same way to grab frames. */
export function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
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

/**
 * True while frames are being rendered. The preview player shares the video
 * element and stands down while it is set: redrawing and re-rendering the
 * editor on every seek made each exported frame ~10x slower.
 */
export let exporting = false;

export async function exportMp4(o: ExportOptions): Promise<Blob> {
  const { rec, video, keyframes, captions, cuts, style, fps } = o;
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
  exporting = true;

  const times = frameTimes(cuts, rec.video.durationMs, fps);
  const total = times.length;
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new Error('Export cancelled.');
      const t = times[i]!;
      await seek(video, t / 1000);
      compose(ctx, w, h, { video, rec, keyframes, captions, t, style });
      const jpeg = await toJpeg(canvas);
      await ffmpeg.writeFile(`f${String(i).padStart(6, '0')}.jpg`, await fetchFile(jpeg));
      o.onProgress('Rendering frames', (i + 1) / total);
    }

    await ffmpeg.writeFile('source', await fetchFile(o.media));
    if (o.narration) await ffmpeg.writeFile('narration.wav', await fetchFile(o.narration));

    ffmpeg.on('progress', ({ progress }) => o.onProgress('Encoding', Math.min(1, progress)));
    o.onProgress('Encoding', 0);

    // `-map 1:a?` keeps the original audio when there is any and is a no-op
    // when there is not. Audio stays a separate track muxed at the end, never
    // an input to the zoom logic — which is what lets Phase 2 swap in an AI
    // voiceover without touching any of this.
    const video_args = [
      '-framerate',
      String(fps),
      '-i',
      'f%06d.jpg',
      '-i',
      'source',
      ...(o.narration ? ['-i', 'narration.wav'] : []),
    ];
    const encode = [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      // Deliberately no -shortest: it would truncate the video to the audio
      // track, and the video is what the demo actually is.
      'out.mp4',
    ];

    const withAudio = (filter: string | null): string[] => [
      ...video_args,
      ...(filter ? ['-filter_complex', filter, '-map', '0:v', '-map', '[aout]'] : []),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      ...encode,
    ];

    // We cannot probe the source for an audio track from wasm, and a graph
    // that references one it does not have is unresolvable. So: ask for
    // everything, and on failure drop the part we are unsure of. The
    // narration is our own file, so it is the one input we know exists.
    const { duck, gain } = o.voice;
    const attempts = [
      mixFilter(cuts, rec.video.durationMs, {
        tabAudio: true,
        narration: !!o.narration,
        duck,
        gain,
      }),
      ...(o.narration
        ? [
            mixFilter(cuts, rec.video.durationMs, {
              tabAudio: false,
              narration: true,
              duck,
              gain,
            }),
          ]
        : []),
    ];

    let code = 1;
    for (const [i, filter] of attempts.entries()) {
      if (i > 0) o.onProgress('Encoding (voice only)', 0);
      code = await ffmpeg.exec(withAudio(filter));
      if (code === 0) break;
    }
    if (code !== 0) {
      o.onProgress('Encoding (no audio)', 0);
      code = await ffmpeg.exec([...video_args, '-map', '0:v', '-an', ...encode]);
    }
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}.`);

    const data = await ffmpeg.readFile('out.mp4');
    o.onProgress('Done', 1);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } finally {
    exporting = false;
    // Free the wasm heap whether we finished or bailed out.
    ffmpeg.terminate();
    video.currentTime = resumeAt;
    if (!wasPaused) void video.play();
  }
}
