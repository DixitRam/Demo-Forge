import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE,
  PROJECT_FORMAT,
  createProject,
  isProject,
  parseProject,
} from '../src/project.js';
import { planZooms } from '../src/zoom-planner.js';
import { SAMPLE } from './fixtures/sample-recording.js';

const DUR = SAMPLE.video.durationMs;

const project = createProject(SAMPLE, 'recording.webm', {
  zooms: planZooms(SAMPLE),
  captions: [{ tStart: 1000, tEnd: 3000, text: 'Open the dashboard' }],
  cuts: [
    { tStart: 0, tEnd: 1000 },
    { tStart: 12_000, tEnd: DUR },
  ],
  script: [{ tStart: 500, text: 'Open the dashboard from the sidebar.', audioMs: 2100 }],
  narrationName: 'recording.narration.wav',
});

describe('project round-trip', () => {
  it('survives JSON serialisation unchanged', () => {
    const back = parseProject(JSON.parse(JSON.stringify(project)));
    expect(back.zooms).toEqual(project.zooms);
    expect(back.captions).toEqual(project.captions);
    expect(back.script).toEqual(project.script);
    expect(back.narrationName).toBe('recording.narration.wav');
    expect(back.style).toEqual(project.style);
    expect(back.recording.events).toEqual(SAMPLE.events);
    expect(back.mediaName).toBe('recording.webm');
    expect(back.cuts).toEqual([
      { tStart: 0, tEnd: 1000 },
      { tStart: 12_000, tEnd: DUR },
    ]);
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
    expect(p.script).toEqual([]);
    expect(p.narrationName).toBe('');
    expect(p.style).toEqual(DEFAULT_STYLE);
  });

  it('drops a stale measurement rather than laying out audio that is gone', () => {
    const p = parseProject({
      ...JSON.parse(JSON.stringify(project)),
      script: [
        { tStart: 0, text: 'kept', audioMs: 1200 },
        { tStart: 3000, text: 'never spoken', audioMs: 0 },
        { tStart: 5000, text: 'nonsense', audioMs: 'soon' },
        { tStart: 7000, text: '   ' },
      ],
    });
    expect(p.script.map((l) => l.audioMs)).toEqual([1200, undefined, undefined]);
    // A line with no words is not a line.
    expect(p.script).toHaveLength(3);
  });
});

describe('cuts', () => {
  it('normalises whatever it is handed', () => {
    const p = parseProject({
      ...project,
      cuts: [
        { tStart: 9000, tEnd: 12_000 },
        { tStart: 1000, tEnd: 5000 },
        { tStart: 4000, tEnd: 6000 },
      ],
    });
    expect(p.cuts).toEqual([
      { tStart: 1000, tEnd: 6000 },
      { tStart: 9000, tEnd: 12_000 },
    ]);
  });

  it('defaults to no cuts', () => {
    expect(parseProject({ format: PROJECT_FORMAT, version: 1, recording: SAMPLE }).cuts).toEqual(
      [],
    );
  });

  it('survives garbage from a hand-edited file', () => {
    expect(parseProject({ ...project, cuts: 'later' }).cuts).toEqual([]);
    expect(parseProject({ ...project, cuts: [{ tStart: 'a', tEnd: null }] }).cuts).toEqual([]);
  });

  it('migrates a legacy kept-span trim into head and tail cuts', () => {
    const legacy = { ...JSON.parse(JSON.stringify(project)), trim: { startMs: 2000, endMs: 9000 } };
    delete legacy.cuts;
    expect(parseProject(legacy).cuts).toEqual([
      { tStart: 0, tEnd: 2000 },
      { tStart: 9000, tEnd: DUR },
    ]);
  });

  it('migrates a legacy full-span trim to nothing cut', () => {
    const legacy = { ...JSON.parse(JSON.stringify(project)), trim: { startMs: 0, endMs: DUR } };
    delete legacy.cuts;
    expect(parseProject(legacy).cuts).toEqual([]);
  });
});
