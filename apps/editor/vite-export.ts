/**
 * Native MP4 export: POST /api/export.
 *
 * The in-browser exporter seeks the video once per frame and encodes in wasm,
 * which costs minutes for a minute of demo. Here ffmpeg decodes the recording
 * straight through (no seeks), each frame is composed by the editor's own
 * compose() on a Skia canvas — the same code the preview draws with — and the
 * frames are piped into native x264 alongside the narration.
 *
 * Wire format, so no multipart parser is needed:
 *   request   [u32 LE header length][header JSON][media bytes][narration bytes]
 *   response  NDJSON progress lines {stage, ratio}, then {done: id} or {error}
 *   GET /api/export/<id>  the finished MP4, deleted once sent
 *
 * ponytail: dev-server only, same as the voice providers.
 */

import { createCanvas, Image, ImageData } from '@napi-rs/canvas';
import type { CaptionCue, CutRegion, DemoRecording, ZoomKeyframe } from '@demoforge/core';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { frameTimes, mixFilter, outputSize } from './src/export/plan.js';
import { backdrop, compose } from './src/render/compose.js';
import { imageFor } from './src/render/drawBackground.js';
import type { FrameStyle } from './src/render/style.js';

export interface ExportHeader {
  rec: DemoRecording;
  keyframes: ZoomKeyframe[];
  captions: CaptionCue[];
  cuts: CutRegion[];
  style: FrameStyle;
  fps: number;
  mediaBytes: number;
  narrationBytes: number;
}

/** Finished renders waiting to be downloaded, by id. */
const done = new Map<string, string>();

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function probe(path: string): { w: number; h: number; audio: boolean } {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', path,
  ]).toString();
  const streams = (JSON.parse(out) as { streams: Array<{ codec_type: string; width?: number; height?: number }> })
    .streams;
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v?.width || !v.height) throw new Error('The recording has no video stream.');
  return { w: v.width, h: v.height, audio: streams.some((s) => s.codec_type === 'audio') };
}

/**
 * Fills `target` with each decoded frame in turn and yields once it is full.
 * One buffer for the whole render: a fresh 20 MB frame per iteration lives
 * outside the JS heap, the GC barely notices it, and the dev server was
 * OOM-killed partway through an 86 s take.
 */
async function* rawFrames(proc: ChildProcess, target: Uint8ClampedArray): AsyncGenerator<void> {
  let at = 0;
  for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
    let from = 0;
    while (from < chunk.length) {
      const n = Math.min(chunk.length - from, target.length - at);
      target.set(chunk.subarray(from, from + n), at);
      at += n;
      from += n;
      if (at === target.length) {
        yield;
        at = 0;
      }
    }
  }
}

function write(proc: ChildProcess, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    proc.stdin!.write(data, (e) => (e ? reject(e) : resolve()));
  });
}

function exited(proc: ChildProcess, name: string, log: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} failed: ${log().trim().split('\n').slice(-3).join(' ')}`)),
    );
  });
}

/** One line per event in the dev server's terminal, tagged by render. */
function logger(tag: string): (msg: string) => void {
  return (msg) => console.log(`[export ${tag}] ${msg}`);
}

const mb = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;

async function render(
  h: ExportHeader,
  dir: string,
  progress: (stage: string, ratio: number) => void,
  cancelled: () => boolean,
  log: (msg: string) => void,
): Promise<string> {
  const media = join(dir, 'source');
  const narration = h.narrationBytes > 0 ? join(dir, 'narration.wav') : null;
  const out = join(dir, 'out.mp4');
  const src = probe(media);
  const { w, h: oh } = outputSize(src.w, src.h, h.style);
  const times = frameTimes(h.cuts, h.rec.video.durationMs, h.fps);
  log(
    `${src.w}x${src.h} -> ${w}x${oh}, ${times.length} frames at ${h.fps} fps ` +
      `(${(times.length / h.fps).toFixed(1)} s of video), ${h.cuts.length} cuts, ` +
      `${h.keyframes.length} zooms, background ${h.style.background.kind}, ` +
      `tab audio ${src.audio ? 'yes' : 'no'}, narration ${narration ? mb(h.narrationBytes) : 'no'}`,
  );

  // An uploaded background is decoded through the browser's Image; give it
  // Skia's, and wait for it, since it loads asynchronously.
  if (h.style.background.kind === 'image') {
    (globalThis as { Image?: unknown }).Image ??= Image;
    const img = imageFor(h.style.background.src);
    if (!img.complete) await new Promise((r) => ((img.onload = r), (img.onerror = r)));
  }

  // Decode at the export rate: decoded frame k is source time k / fps, so a
  // cut is just frames we read and throw away. Never a seek.
  const decoder = spawn('ffmpeg', [
    '-v', 'error', '-i', media, '-vf', `fps=${h.fps}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ]);
  const filter = mixFilter(h.cuts, h.rec.video.durationMs, {
    tabAudio: src.audio,
    narration: !!narration,
    duck: h.style.voice.duck,
    gain: h.style.voice.gain,
  });
  const encoder = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${oh}`, '-r', String(h.fps), '-i', 'pipe:0',
    '-i', media,
    ...(narration ? ['-i', narration] : []),
    ...(filter ? ['-filter_complex', filter, '-map', '0:v', '-map', '[aout]'] : ['-map', '0:v']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
  let decLog = '';
  let encLog = '';
  decoder.stderr.on('data', (d: Buffer) => (decLog += d));
  encoder.stderr.on('data', (d: Buffer) => (encLog += d));
  const encoded = exited(encoder, 'Encoder', () => encLog);
  encoded.catch(() => {}); // awaited below; don't let an early failure go unhandled

  // compose() reads a video element's size and readyState and draws it; a
  // canvas holding the decoded frame answers to all three.
  const frame = Object.assign(createCanvas(src.w, src.h), {
    videoWidth: src.w,
    videoHeight: src.h,
    readyState: 4,
  });
  const frameCtx = frame.getContext('2d');
  const pixels = new ImageData(src.w, src.h);
  const canvas = createCanvas(w, oh);
  const ctx = canvas.getContext('2d');
  // Wallpaper and shadow are ~40 ms of Skia work and identical in every frame.
  const still = createCanvas(w, oh);
  backdrop(still.getContext('2d') as unknown as CanvasRenderingContext2D, w, oh, {
    video: frame as unknown as HTMLVideoElement,
    rec: h.rec,
    style: h.style,
  });

  // Where the time goes: waiting on the decoder, drawing, or waiting on the
  // encoder to take the frame (pipe backpressure means x264 is behind).
  const spent = { decode: 0, draw: 0, encode: 0 };
  const t0 = performance.now();
  let mark = t0;
  let nextLog = 0.1;
  const report = (i: number): void => {
    const secs = (performance.now() - t0) / 1000;
    const rate = i / secs;
    const ms = (v: number): string => (v / i).toFixed(1);
    log(
      `${Math.round((i / times.length) * 100)}%  ${i}/${times.length} frames  ${secs.toFixed(1)} s  ` +
        `${rate.toFixed(1)} fps  ETA ${((times.length - i) / rate).toFixed(0)} s  ` +
        `| per frame: decode ${ms(spent.decode)} ms, draw ${ms(spent.draw)} ms, encode ${ms(spent.encode)} ms`,
    );
  };

  try {
    let index = -1;
    let i = 0;
    for await (const _ of rawFrames(decoder, pixels.data)) {
      index++;
      let now = performance.now();
      spent.decode += now - mark;
      let drawn = false;
      // Several output frames can land on one source frame (a cut boundary,
      // or a source shorter than the header claims), so loop, not if.
      while (i < times.length && Math.round((times[i]! / 1000) * h.fps) <= index) {
        if (cancelled()) throw new Error('Export cancelled.');
        if (!drawn) frameCtx.putImageData(pixels, 0, 0);
        drawn = true;
        compose(ctx as unknown as CanvasRenderingContext2D, w, oh, {
          video: frame as unknown as HTMLVideoElement,
          rec: h.rec,
          keyframes: h.keyframes,
          captions: h.captions,
          t: times[i]!,
          style: h.style,
          backdrop: still as unknown as CanvasImageSource,
        });
        // The background fills the canvas, so every pixel is opaque and Skia's
        // premultiplied buffer is already plain RGBA. Reading it is also what
        // makes Skia actually rasterise, so it counts as drawing.
        const px = canvas.data();
        spent.draw += performance.now() - now;
        now = performance.now();
        await write(encoder, px);
        spent.encode += performance.now() - now;
        now = performance.now();
        i++;
        if (i % 15 === 0) progress('Rendering', i / times.length);
        if (i / times.length >= nextLog) {
          report(i);
          nextLog += 0.1;
        }
      }
      mark = performance.now();
      if (i >= times.length) break;
    }
    if (i === 0) throw new Error(`Decoder produced no frames. ${decLog.trim()}`);
    encoder.stdin.end();
    progress('Finishing', 1);
    const f0 = performance.now();
    await encoded;
    log(
      `done: frames ${((f0 - t0) / 1000).toFixed(1)} s + finishing ${((performance.now() - f0) / 1000).toFixed(1)} s ` +
        `= ${((performance.now() - t0) / 1000).toFixed(1)} s, ${mb(statSync(out).size)}`,
    );
    return out;
  } finally {
    // Only reached with the encoder still running if we bailed out. ffmpeg
    // treats SIGTERM as "finish up" and would sit waiting on its input pipe.
    decoder.kill('SIGKILL');
    if (encoder.exitCode === null) {
      encoder.stdin.destroy();
      encoder.kill('SIGKILL');
    }
  }
}

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const log = logger(randomUUID().slice(0, 6));
  const u0 = performance.now();
  const body = await readBody(req);
  log(`received ${mb(body.length)} in ${((performance.now() - u0) / 1000).toFixed(1)} s`);
  const headerLen = body.readUInt32LE(0);
  const header = JSON.parse(body.subarray(4, 4 + headerLen).toString('utf8')) as ExportHeader;
  const dir = mkdtempSync(join(tmpdir(), 'demoforge-export-'));
  let at = 4 + headerLen;
  writeFileSync(join(dir, 'source'), body.subarray(at, (at += header.mediaBytes)));
  if (header.narrationBytes > 0) {
    writeFileSync(join(dir, 'narration.wav'), body.subarray(at, at + header.narrationBytes));
  }

  let gone = false;
  res.on('close', () => (gone = !res.writableFinished));
  res.setHeader('Content-Type', 'application/x-ndjson');
  const send = (o: object): void => void res.write(`${JSON.stringify(o)}\n`);
  try {
    const out = await render(header, dir, (stage, ratio) => send({ stage, ratio }), () => gone, log);
    const id = randomUUID();
    done.set(id, out);
    send({ done: id });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    const msg = e instanceof Error ? e.message : String(e);
    log(gone ? 'cancelled by the browser' : `FAILED: ${msg}`);
    send({ error: msg });
  }
  res.end();
}

function handleGet(id: string, res: ServerResponse): void {
  const path = done.get(id);
  if (!path || !existsSync(path)) {
    res.statusCode = 404;
    return void res.end();
  }
  done.delete(id);
  console.log(`[export] downloading ${mb(statSync(path).size)}`);
  res.setHeader('Content-Type', 'video/mp4');
  createReadStream(path)
    .on('close', () => rmSync(join(path, '..'), { recursive: true, force: true }))
    .pipe(res);
}

export function exportPlugin(): Plugin {
  return {
    name: 'demoforge-export',
    configureServer(server) {
      const ok = hasFfmpeg();
      server.middlewares.use('/api/export', (req, res) => {
        const id = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
        if (req.method === 'POST') {
          return void handlePost(req, res).catch((e) => {
            res.statusCode = 500;
            res.end(String(e));
          });
        }
        if (id) return handleGet(id, res);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok }));
      });
    },
  };
}
