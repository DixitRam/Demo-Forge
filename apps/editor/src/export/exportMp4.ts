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
import {
  editedDuration,
  editedToSource,
  keptSegments,
  type CaptionCue,
  type CutRegion,
  type DemoRecording,
  type VoiceStyle,
  type ZoomKeyframe,
} from '@demoforge/core';
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

/**
 * Source-video timestamps for every frame of the export, in order.
 *
 * We walk EDITED time — the demo as the viewer sees it — and map each frame
 * back to source time through the edit list. Everything else (zooms,
 * captions, the cursor path) is then evaluated at a source timestamp with no
 * remapping of its own, which is what keeps cutting cheap.
 */
export function frameTimes(
  cuts: readonly CutRegion[],
  durationMs: number,
  fps: number,
): number[] {
  const total = editedDuration(cuts, durationMs);
  const count = Math.max(1, Math.round((total / 1000) * fps));
  return Array.from({ length: count }, (_, i) =>
    editedToSource(cuts, durationMs, (i / fps) * 1000),
  );
}

/**
 * Splice one input's audio to match the cuts: trim each kept run out of it and
 * concat them. Returns null when there is nothing to splice.
 *
 * Doing this as a filter graph rather than decoding and re-splicing in the
 * browser keeps the whole audio path inside ffmpeg, where it is already going.
 * The narration mixdown is in source time for exactly this reason — it goes
 * through the identical filter, with no idea that cuts exist.
 */
export function audioFilter(
  cuts: readonly CutRegion[],
  durationMs: number,
  input = 1,
  label = 'aout',
  volume?: number,
): string | null {
  const segs = keptSegments(cuts, durationMs);
  if (segs.length === 0) return null;
  const tag = (i: number): string => `x${input}_${i}`;
  const parts = segs.map(
    (s, i) =>
      `[${input}:a]atrim=${(s.start / 1000).toFixed(3)}:${(s.end / 1000).toFixed(3)},` +
      `asetpts=N/SR/TB[${tag(i)}]`,
  );
  const inputs = segs.map((_, i) => `[${tag(i)}]`).join('');
  const joined = `${inputs}concat=n=${segs.length}:v=0:a=1`;
  return volume === undefined
    ? `${parts.join(';')};${joined}[${label}]`
    : `${parts.join(';')};${joined}[${label}_raw];[${label}_raw]volume=${volume.toFixed(3)}[${label}]`;
}

/**
 * The full audio graph: the captured tab audio, the narration, or both mixed
 * with the recording ducked underneath the voice.
 *
 * ponytail: a constant duck, not a sidechain compressor. It is one number and
 * it is right for a demo where the tab audio is ambience; swap in
 * `sidechaincompress` if the recording ever carries something worth hearing.
 */
export function mixFilter(
  cuts: readonly CutRegion[],
  durationMs: number,
  opts: { tabAudio: boolean; narration: boolean; duck: number; gain: number },
): string | null {
  const src = opts.tabAudio
    ? audioFilter(cuts, durationMs, 1, 'aorig', opts.narration ? opts.duck : undefined)
    : null;
  // The mixdown is at unity, so the voice level is applied here — the same
  // number the preview hands to the audio element.
  const nar = opts.narration ? audioFilter(cuts, durationMs, 2, 'anarr', opts.gain) : null;

  if (src && nar) {
    return (
      `${src};${nar};[aorig][anarr]` +
      `amix=inputs=2:normalize=0:duration=longest:dropout_transition=0[aout]`
    );
  }
  if (nar) return nar.replace(/\[anarr\]$/, '[aout]');
  return src?.replace(/\[aorig\]$/, '[aout]') ?? null;
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
    // Free the wasm heap whether we finished or bailed out.
    ffmpeg.terminate();
    video.currentTime = resumeAt;
    if (!wasPaused) void video.play();
  }
}
