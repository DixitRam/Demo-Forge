import {
  DEFAULT_STYLE,
  isProject,
  parseProject,
  planZooms,
  reconcileTimebase,
  type CaptionCue,
  type DemoRecording,
  type ProjectStyle,
  type CutRegion,
  type ZoomKeyframe,
} from '@demoforge/core';

export interface LoadedProject {
  rec: DemoRecording;
  video: HTMLVideoElement;
  videoUrl: string;
  /** The original file, kept so the exporter can mux its audio track back in. */
  media: Blob;
  mediaName: string;
  /** Edits restored from a project file, or planned fresh from the log. */
  zooms: ZoomKeyframe[];
  captions: CaptionCue[];
  cuts: CutRegion[];
  style: ProjectStyle;
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

/**
 * Accepts either a saved project (.dfp.json — recording plus every edit) or a
 * raw demo.json straight out of the extension, which gets a freshly planned
 * set of zooms.
 */
export async function loadBundle(files: File[]): Promise<LoadedProject> {
  const json = files.find((f) => f.name.endsWith('.json'));
  const media = files.find((f) => /\.(webm|mp4|mkv)$/i.test(f.name));
  if (!json || !media) {
    throw new Error('Drop a video plus either demo.json or a .dfp.json project.');
  }

  const parsed: unknown = JSON.parse(await json.text());
  const project = isProject(parsed) ? parseProject(parsed) : null;
  const source = project ? project.recording : parsed;
  if (!isRecording(source)) throw new Error(`${json.name} is not a DemoRecording.`);

  const videoUrl = URL.createObjectURL(media);
  const video = await loadVideo(videoUrl);

  // Timing risk #1: trust the decoded video over what the recorder claimed.
  const { rec, warning } = reconcileTimebase(source, await realDurationMs(video));
  const base: LoadedProject = {
    rec,
    video,
    videoUrl,
    media,
    mediaName: media.name,
    zooms: project ? project.zooms : planZooms(rec),
    captions: project ? project.captions : [],
    cuts: project ? project.cuts : [],
    style: project ? project.style : DEFAULT_STYLE,
  };
  return warning ? { ...base, warning } : base;
}
