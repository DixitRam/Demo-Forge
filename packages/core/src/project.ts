/**
 * The saved project: everything a demo is, apart from the media file itself.
 *
 * This lives in `core` rather than the editor on purpose. It is a plain-data,
 * fully-serialisable description of a demo — which means a tool, a script, or
 * an agent can read one, change the zooms or captions, write it back, and the
 * editor will open exactly that. No UI in the loop.
 *
 * The media is referenced by name, not embedded: a project file stays a few
 * kilobytes of readable JSON next to the .webm it describes.
 *
 * Arrays are time-ordered, so "the third zoom" is a stable way to address one.
 */

import type { DemoRecording } from './types.js';
import type { ZoomKeyframe } from './zoom-planner.js';

export const PROJECT_FORMAT = 'demoforge-project';
export const PROJECT_VERSION = 1;

/**
 * In and out points, in source-video milliseconds.
 *
 * Deliberately a single kept span rather than a list of cuts: that keeps
 * timeline time equal to source time everywhere except the final encode, so
 * zooms, captions and the cursor path need no remapping at all. Cutting
 * middles out would need a real edit list threaded through all of them.
 */
export interface Trim {
  startMs: number;
  endMs: number;
}

/** Shortest span worth keeping — below this there is nothing to scrub. */
export const MIN_TRIM_MS = 500;

/** The kept span, whether or not the project has been trimmed. */
export function effectiveTrim(trim: Trim | null, durationMs: number): Trim {
  return clampTrim(trim ?? { startMs: 0, endMs: durationMs }, durationMs);
}

export function clampTrim(trim: Trim, durationMs: number): Trim {
  const limit = Math.max(durationMs, MIN_TRIM_MS);
  const startMs = Math.min(Math.max(trim.startMs, 0), limit - MIN_TRIM_MS);
  const endMs = Math.min(Math.max(trim.endMs, startMs + MIN_TRIM_MS), limit);
  return { startMs, endMs };
}

export interface CaptionCue {
  tStart: number;
  tEnd: number;
  text: string;
}

export interface CaptionStyle {
  /** Cap height as a fraction of the output height. */
  size: number;
  position: 'top' | 'bottom';
  color: string;
  /** Plate behind the text. Empty string draws none. */
  background: string;
}

export type ProjectBackground =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'wallpaper'; id: string }
  /** A data: URL, so a project stays self-contained without the original file. */
  | { kind: 'image'; src: string };

export interface CursorStyle {
  show: boolean;
  /** Height as a fraction of the output height. */
  size: number;
  /** 0 = snap between clicks, 1 = long lazy glides. */
  smoothing: number;
  clicks: boolean;
}

/**
 * Render settings. Every length is a FRACTION of the output's shorter side,
 * never pixels — the preview and the export render at different resolutions
 * and must look identical.
 */
export interface ProjectStyle {
  background: ProjectBackground;
  /** Output aspect ratio (w/h). null keeps the recording's own. */
  aspect: number | null;
  padding: number;
  radius: number;
  shadow: { blur: number; y: number; alpha: number };
  cursor: CursorStyle;
  captions: CaptionStyle;
}

export interface DemoProject {
  format: typeof PROJECT_FORMAT;
  version: number;
  createdAt: string;
  /** Filename of the video this project describes; not a path. */
  mediaName: string;
  recording: DemoRecording;
  /** Time-ordered, non-overlapping. */
  zooms: ZoomKeyframe[];
  /** Time-ordered. */
  captions: CaptionCue[];
  /** null keeps the whole recording. */
  trim: Trim | null;
  style: ProjectStyle;
}

export const DEFAULT_STYLE: ProjectStyle = {
  background: { kind: 'wallpaper', id: 'cobalt' },
  aspect: null,
  padding: 0.05,
  radius: 0.02,
  shadow: { blur: 0.05, y: 0.018, alpha: 0.5 },
  cursor: { show: true, size: 0.045, smoothing: 0.4, clicks: true },
  captions: { size: 0.045, position: 'bottom', color: '#ffffff', background: 'rgba(2,6,23,0.72)' },
};

export function createProject(
  recording: DemoRecording,
  mediaName: string,
  zooms: ZoomKeyframe[] = [],
  captions: CaptionCue[] = [],
  trim: Trim | null = null,
  style: ProjectStyle = DEFAULT_STYLE,
): DemoProject {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    createdAt: recording.createdAt,
    mediaName,
    recording,
    zooms,
    captions,
    trim: trim ? clampTrim(trim, recording.video.durationMs) : null,
    style,
  };
}

export function isProject(value: unknown): value is DemoProject {
  return (value as DemoProject | null)?.format === PROJECT_FORMAT;
}

// --- validation ------------------------------------------------------------
// A project file is user-supplied and may have been hand-edited or written by
// an agent, so it is a trust boundary. Everything is checked and anything
// missing falls back to a default rather than reaching the renderer as NaN.

class ProjectError extends Error {}

function num(v: unknown, fallback: number, lo = -Infinity, hi = Infinity): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(n, lo), hi);
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseBackground(v: unknown): ProjectBackground {
  const b = v as Record<string, unknown> | null;
  switch (b?.kind) {
    case 'solid':
      return { kind: 'solid', color: str(b.color, '#0f172a') };
    case 'gradient':
      return {
        kind: 'gradient',
        from: str(b.from, '#1e293b'),
        to: str(b.to, '#0b1220'),
        angle: num(b.angle, 160, 0, 360),
      };
    case 'image':
      return { kind: 'image', src: str(b.src, '') };
    case 'wallpaper':
      return { kind: 'wallpaper', id: str(b.id, 'cobalt') };
    default:
      return DEFAULT_STYLE.background;
  }
}

function parseStyle(v: unknown): ProjectStyle {
  const s = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_STYLE;
  const shadow = (s.shadow ?? {}) as Record<string, unknown>;
  const cursor = (s.cursor ?? {}) as Record<string, unknown>;
  const captions = (s.captions ?? {}) as Record<string, unknown>;
  const aspect = s.aspect;

  return {
    background: parseBackground(s.background),
    aspect: typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0 ? aspect : null,
    padding: num(s.padding, d.padding, 0, 0.45),
    radius: num(s.radius, d.radius, 0, 0.5),
    shadow: {
      blur: num(shadow.blur, d.shadow.blur, 0, 1),
      y: num(shadow.y, d.shadow.y, -1, 1),
      alpha: num(shadow.alpha, d.shadow.alpha, 0, 1),
    },
    cursor: {
      show: bool(cursor.show, d.cursor.show),
      size: num(cursor.size, d.cursor.size, 0.005, 0.5),
      smoothing: num(cursor.smoothing, d.cursor.smoothing, 0, 1),
      clicks: bool(cursor.clicks, d.cursor.clicks),
    },
    captions: {
      size: num(captions.size, d.captions.size, 0.01, 0.3),
      position: captions.position === 'top' ? 'top' : 'bottom',
      color: str(captions.color, d.captions.color),
      background: str(captions.background, d.captions.background),
    },
  };
}

function parseZooms(v: unknown, durationMs: number): ZoomKeyframe[] {
  if (!Array.isArray(v)) return [];
  const out: ZoomKeyframe[] = [];
  for (const raw of v) {
    const k = (raw ?? {}) as Record<string, unknown>;
    const tStart = num(k.tStart, 0, 0, durationMs);
    const tEnd = num(k.tEnd, 0, 0, durationMs);
    if (tEnd <= tStart) continue;
    out.push({
      tStart,
      tEnd,
      targetXNorm: num(k.targetXNorm, 0.5, 0, 1),
      targetYNorm: num(k.targetYNorm, 0.5, 0, 1),
      scale: num(k.scale, 1.8, 1, 10),
      easing: k.easing === 'linear' ? 'linear' : 'easeInOutCubic',
      ...(k.focus === 'manual' ? { focus: 'manual' as const } : { focus: 'auto' as const }),
    });
  }
  out.sort((a, b) => a.tStart - b.tStart);

  // The evaluator requires non-overlapping keyframes; an edited file may not
  // have honoured that, so trim rather than render something wrong.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i]!.tEnd > out[i + 1]!.tStart) out[i]!.tEnd = out[i + 1]!.tStart;
  }
  return out.filter((k) => k.tEnd > k.tStart);
}

function parseCaptions(v: unknown, durationMs: number): CaptionCue[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const c = (raw ?? {}) as Record<string, unknown>;
      return {
        tStart: num(c.tStart, 0, 0, durationMs),
        tEnd: num(c.tEnd, 0, 0, durationMs),
        text: str(c.text, ''),
      };
    })
    .filter((c) => c.tEnd > c.tStart)
    .sort((a, b) => a.tStart - b.tStart);
}

function parseTrim(v: unknown, durationMs: number): Trim | null {
  const t = v as Record<string, unknown> | null;
  if (!t || typeof t !== 'object') return null;
  const startMs = num(t.startMs, 0);
  const endMs = num(t.endMs, durationMs);
  const clamped = clampTrim({ startMs, endMs }, durationMs);
  // A trim covering the whole recording is not a trim.
  return clamped.startMs === 0 && clamped.endMs >= durationMs ? null : clamped;
}

/** Throws with a readable message rather than half-loading a broken file. */
export function parseProject(value: unknown): DemoProject {
  const p = (value ?? {}) as Record<string, unknown>;
  if (p.format !== PROJECT_FORMAT) throw new ProjectError('Not a DemoForge project file.');
  if (num(p.version, 0) > PROJECT_VERSION) {
    throw new ProjectError(
      `Project format v${String(p.version)} is newer than this editor understands (v${PROJECT_VERSION}).`,
    );
  }

  const rec = p.recording as DemoRecording | undefined;
  if (!rec || !Array.isArray(rec.events) || !rec.video || !rec.viewport) {
    throw new ProjectError('Project is missing its recording.');
  }

  const durationMs = num(rec.video.durationMs, 0, 0);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    createdAt: str(p.createdAt, rec.createdAt),
    mediaName: str(p.mediaName, ''),
    recording: rec,
    zooms: parseZooms(p.zooms, durationMs),
    captions: parseCaptions(p.captions, durationMs),
    trim: parseTrim(p.trim, durationMs),
    style: parseStyle(p.style),
  };
}
