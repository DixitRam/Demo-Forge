/**
 * Export on the dev server with native ffmpeg (vite-export.ts). Same options
 * as exportMp4, same compose(), a fraction of the time: the server decodes the
 * recording straight through instead of seeking it frame by frame.
 */

import type { ExportOptions } from './exportMp4.js';

/** Whether the dev server can render; false on a static build. */
export async function serverExportAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/export');
    return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

export async function serverExport(o: Omit<ExportOptions, 'video'>): Promise<Blob> {
  try {
    return await run(o);
  } catch (e) {
    // Aborting the fetch kills the render server-side; say so plainly.
    if (o.signal?.aborted) throw new Error('Export cancelled.');
    throw e;
  }
}

async function run(o: Omit<ExportOptions, 'video'>): Promise<Blob> {
  const header = new TextEncoder().encode(
    JSON.stringify({
      rec: o.rec,
      keyframes: o.keyframes,
      captions: o.captions,
      cuts: o.cuts,
      style: { ...o.style, voice: o.voice },
      fps: o.fps,
      mediaBytes: o.media.size,
      narrationBytes: o.narration?.size ?? 0,
    }),
  );
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);

  o.onProgress('Uploading', 0);
  const res = await fetch('/api/export', {
    method: 'POST',
    body: new Blob([len, header, o.media, ...(o.narration ? [o.narration] : [])]),
    signal: o.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Export server returned ${res.status}.`);

  // NDJSON: progress lines, then one {done} or {error}.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop()!;
    for (const line of lines.filter(Boolean)) {
      const msg = JSON.parse(line) as { stage?: string; ratio?: number; done?: string; error?: string };
      if (msg.error) throw new Error(msg.error);
      if (msg.done) {
        o.onProgress('Downloading', 1);
        const file = await fetch(`/api/export/${msg.done}`, { signal: o.signal });
        if (!file.ok) throw new Error('The rendered file went missing.');
        return await file.blob();
      }
      if (msg.stage) o.onProgress(msg.stage, msg.ratio ?? 0);
    }
  }
  throw new Error('The export server closed the connection early.');
}
