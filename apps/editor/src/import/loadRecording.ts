import { reconcileTimebase, type DemoRecording } from '@demoforge/core';

export interface LoadedProject {
  rec: DemoRecording;
  video: HTMLVideoElement;
  videoUrl: string;
  /** The original file, kept so the exporter can mux its audio track back in. */
  media: Blob;
  mediaName: string;
  warning?: string;
}

function isRecording(v: unknown): v is DemoRecording {
  const r = v as DemoRecording | null;
  return (
    !!r &&
    Array.isArray(r.events) &&
    !!r.video &&
    !!r.viewport &&
    typeof r.video.durationMs === 'number' &&
    typeof r.viewport.w === 'number'
  );
}

/**
 * MediaRecorder's WebM has no duration in its header, so `video.duration` is
 * Infinity until the element has been seeked past the end. Force it.
 */
function realDurationMs(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration * 1000);
  return new Promise((resolve) => {
    const done = (): void => {
      if (!Number.isFinite(v.duration)) return;
      v.removeEventListener('durationchange', done);
      v.currentTime = 0;
      resolve(v.duration * 1000);
    };
    v.addEventListener('durationchange', done);
    v.currentTime = 1e9;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.src = url;
  v.preload = 'auto';
  v.muted = true; // audio is muxed at export, not played through the preview
  v.playsInline = true;
  return new Promise((resolve, reject) => {
    v.addEventListener('loadedmetadata', () => resolve(v), { once: true });
    v.addEventListener('error', () => reject(new Error('Could not decode the video file.')), {
      once: true,
    });
  });
}

export async function loadBundle(files: File[]): Promise<LoadedProject> {
  const json = files.find((f) => f.name.endsWith('.json'));
  const media = files.find((f) => /\.(webm|mp4|mkv)$/i.test(f.name));
  if (!json || !media) throw new Error('Drop both demo.json and recording.webm.');

  const parsed: unknown = JSON.parse(await json.text());
  if (!isRecording(parsed)) throw new Error(`${json.name} is not a DemoRecording.`);

  const videoUrl = URL.createObjectURL(media);
  const video = await loadVideo(videoUrl);

  // Timing risk #1: trust the decoded video over what the recorder claimed.
  const { rec, warning } = reconcileTimebase(parsed, await realDurationMs(video));
  const base = { rec, video, videoUrl, media, mediaName: media.name };
  return warning ? { ...base, warning } : base;
}
