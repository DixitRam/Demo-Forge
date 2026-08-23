/**
 * MediaRecorder wrapper. Lives in the offscreen document because an MV3
 * service worker has no MediaRecorder and no getUserMedia.
 *
 * CAPTURE CHOICE: chrome.tabCapture, not getDisplayMedia.
 * tabCapture gives one clean tab with no OS cursor, no window chrome and no
 * source picker. We do not want the OS cursor: the editor draws its own
 * synthetic cursor from the click log (which is also what makes Phase 3's
 * Playwright capture work, since Playwright never moves a real cursor).
 * getDisplayMedia would add a picker dialog, desktop clutter and a real cursor
 * we would then have to hide.
 */

import { nowWall } from './clock.js';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const CHUNK_MS = 1000;

export interface ActiveRecording {
  t0: number;
  mime: string;
  stop(): Promise<StopResult>;
}

export interface StopResult {
  blob: Blob;
  durationMs: number;
  width: number;
  height: number;
  mime: string;
  hasAudio: boolean;
}

function pickMime(): string {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
}

async function getTabStream(streamId: string): Promise<MediaStream> {
  const video = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } };
  const audio = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video } as MediaStreamConstraints);
  } catch {
    // Audio is optional in Phase 1 — never block a recording on it.
    return navigator.mediaDevices.getUserMedia({ video } as MediaStreamConstraints);
  }
}

export async function startRecording(streamId: string): Promise<ActiveRecording> {
  const stream = await getTabStream(streamId);
  const hasAudio = stream.getAudioTracks().length > 0;

  // tabCapture swallows the tab's own audio; route it back to the speakers so
  // the person recording can still hear what they are demoing.
  let audioCtx: AudioContext | null = null;
  if (hasAudio) {
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);
  }

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // t0 is stamped when the recorder actually starts, never before .start().
  const t0 = await new Promise<number>((resolve, reject) => {
    recorder.onstart = () => resolve(nowWall());
    recorder.onerror = (e) => reject(e);
    recorder.start(CHUNK_MS);
  });

  async function stop(): Promise<StopResult> {
    // The last captured frame corresponds to the moment we ask it to stop.
    const durationMs = nowWall() - t0;
    const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      recorder.stop();
    });

    for (const track of stream.getTracks()) track.stop();
    await audioCtx?.close();

    return {
      blob,
      durationMs,
      width: settings.width ?? 0,
      height: settings.height ?? 0,
      mime,
      hasAudio,
    };
  }

  return { t0, mime, stop };
}
