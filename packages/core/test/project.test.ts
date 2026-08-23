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

const project = createProject(SAMPLE, 'recording.webm', planZooms(SAMPLE), [
  { tStart: 1000, tEnd: 3000, text: 'Open the dashboard' },
]);

describe('project round-trip', () => {
  it('survives JSON serialisation unchanged', () => {
    const back = parseProject(JSON.parse(JSON.stringify(project)));
    expect(back.zooms).toEqual(project.zooms);
    expect(back.captions).toEqual(project.captions);
    expect(back.style).toEqual(project.style);
    expect(back.recording.events).toEqual(SAMPLE.events);
    expect(back.mediaName).toBe('recording.webm');
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
