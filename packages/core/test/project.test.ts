import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  MIN_TRIM_MS,
  PROJECT_FORMAT,
  clampTrim,
  createProject,
  effectiveTrim,
  isProject,
  parseProject,
} from '../src/project.js';
import { planZooms } from '../src/zoom-planner.js';
import { SAMPLE } from './fixtures/sample-recording.js';

const DUR = SAMPLE.video.durationMs;

const project = createProject(
  SAMPLE,
  'recording.webm',
  planZooms(SAMPLE),
  [{ tStart: 1000, tEnd: 3000, text: 'Open the dashboard' }],
  { startMs: 1000, endMs: 12_000 },
);

describe('project round-trip', () => {
  it('survives JSON serialisation unchanged', () => {
    const back = parseProject(JSON.parse(JSON.stringify(project)));
    expect(back.zooms).toEqual(project.zooms);
    expect(back.captions).toEqual(project.captions);
    expect(back.style).toEqual(project.style);
    expect(back.recording.events).toEqual(SAMPLE.events);
    expect(back.mediaName).toBe('recording.webm');
    expect(back.trim).toEqual({ startMs: 1000, endMs: 12_000 });
  });

  it('is recognisable without being fully parsed', () => {
    expect(isProject(project)).toBe(true);
    expect(isProject(SAMPLE)).toBe(false);
    expect(isProject(null)).toBe(false);
  });
});

describe('parseProject rejects what it cannot render', () => {
  it('refuses a file that is not a project', () => {
    expect(() => parseProject({ hello: 1 })).toThrow(/not a demoforge project/i);
    expect(() => parseProject(SAMPLE)).toThrow();
  });

  it('refuses a project with no recording', () => {
    expect(() => parseProject({ format: PROJECT_FORMAT, version: 1 })).toThrow(/recording/i);
  });

  it('refuses a format from the future rather than guessing', () => {
    expect(() => parseProject({ ...project, version: 99 })).toThrow(/newer/i);
  });
});

describe('parseProject repairs a hand-edited file', () => {
  const edited = (patch: Record<string, unknown>) =>
    parseProject({ ...JSON.parse(JSON.stringify(project)), ...patch });

  it('sorts and de-overlaps zooms an agent may have written carelessly', () => {
    const p = edited({
      zooms: [
        { tStart: 6000, tEnd: 9000, targetXNorm: 0.5, targetYNorm: 0.5, scale: 2 },
        { tStart: 1000, tEnd: 7000, targetXNorm: 0.2, targetYNorm: 0.2, scale: 2 },
      ],
    });
    expect(p.zooms.map((z) => z.tStart)).toEqual([1000, 6000]);
    expect(p.zooms[0]!.tEnd).toBe(6000);
  });

  it('drops zero-length and inverted spans instead of rendering them', () => {
    const p = edited({
      zooms: [{ tStart: 5000, tEnd: 1000, targetXNorm: 0.5, targetYNorm: 0.5, scale: 2 }],
      captions: [{ tStart: 5000, tEnd: 5000, text: 'nope' }],
    });
    expect(p.zooms).toHaveLength(0);
    expect(p.captions).toHaveLength(0);
  });

  it('never lets NaN or nonsense reach the renderer', () => {
    const p = edited({
      style: {
        padding: 'wide',
        radius: Number.NaN,
        aspect: 0,
        shadow: { alpha: 42 },
        cursor: { size: -1, smoothing: 'lots' },
        captions: { position: 'sideways', size: 999 },
        background: { kind: 'nope' },
      },
    });
    expect(p.style.padding).toBe(DEFAULT_STYLE.padding);
    expect(p.style.radius).toBe(DEFAULT_STYLE.radius);
    expect(p.style.aspect).toBeNull();
    expect(p.style.shadow.alpha).toBe(1);
    expect(p.style.cursor.size).toBeGreaterThan(0);
    expect(p.style.cursor.smoothing).toBe(DEFAULT_STYLE.cursor.smoothing);
    expect(p.style.captions.position).toBe('bottom');
    expect(p.style.captions.size).toBeLessThanOrEqual(0.3);
    expect(p.style.background).toEqual(DEFAULT_STYLE.background);
  });

  it('clamps times to the recording rather than seeking off the end', () => {
    const p = edited({
      zooms: [{ tStart: -5000, tEnd: 999_999, targetXNorm: 9, targetYNorm: -9, scale: 2 }],
    });
    expect(p.zooms[0]!.tStart).toBe(0);
    expect(p.zooms[0]!.tEnd).toBe(SAMPLE.video.durationMs);
    expect(p.zooms[0]!.targetXNorm).toBe(1);
    expect(p.zooms[0]!.targetYNorm).toBe(0);
  });

  it('keeps an agent-written project minimal — zooms and captions may be omitted', () => {
    const p = parseProject({
      format: PROJECT_FORMAT,
      version: 1,
      recording: SAMPLE,
    });
    expect(p.zooms).toEqual([]);
    expect(p.captions).toEqual([]);
    expect(p.style).toEqual(DEFAULT_STYLE);
  });
});

describe('trim', () => {
  it('treats a span covering the whole recording as no trim', () => {
    expect(createProject(SAMPLE, 'r.webm', [], [], { startMs: 0, endMs: DUR }).trim).toEqual({
      startMs: 0,
      endMs: DUR,
    });
    // …but a round-trip through the parser normalises it away.
    expect(parseProject({ ...project, trim: { startMs: 0, endMs: DUR } }).trim).toBeNull();
    expect(parseProject({ ...project, trim: null }).trim).toBeNull();
  });

  it('falls back to the whole recording when absent', () => {
    expect(effectiveTrim(null, DUR)).toEqual({ startMs: 0, endMs: DUR });
  });

  it('keeps the span inside the recording and at least MIN_TRIM_MS long', () => {
    expect(clampTrim({ startMs: -5000, endMs: 999_999 }, DUR)).toEqual({
      startMs: 0,
      endMs: DUR,
    });
    expect(clampTrim({ startMs: 8000, endMs: 8000 }, DUR)).toEqual({
      startMs: 8000,
      endMs: 8000 + MIN_TRIM_MS,
    });
  });

  it('never returns an inverted span, however it was written', () => {
    const t = clampTrim({ startMs: 12_000, endMs: 3000 }, DUR);
    expect(t.endMs).toBeGreaterThan(t.startMs);
  });

  it('pulls a start that would leave no room back off the end', () => {
    const t = clampTrim({ startMs: DUR, endMs: DUR }, DUR);
    expect(t.startMs).toBe(DUR - MIN_TRIM_MS);
    expect(t.endMs).toBe(DUR);
  });

  it('survives garbage from a hand-edited file', () => {
    const p = parseProject({ ...project, trim: { startMs: 'soon', endMs: Number.NaN } });
    expect(p.trim).toBeNull();
  });
});
