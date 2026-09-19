/**
 * What an export renders, independent of who renders it: the output size, the
 * source timestamp of every frame, and the audio graph. Shared by the
 * in-browser exporter (exportMp4.ts) and the native one on the dev server
 * (vite-export.ts), so the two cannot drift apart.
 */

import { editedDuration, editedToSource, keptSegments, type CutRegion } from '@demoforge/core';
import { outputAspect, type FrameStyle } from '../render/style.js';

/** Cap the long edge; a 4K screen recording is not worth a 4K wasm encode. */
export const MAX_LONG_EDGE = 1920;

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
