import {
  cutDuration,
  editedDuration,
  evaluateZoom,
  keptSegments,
  normalizeCuts,
  planZooms,
  type CutRegion,
  type DemoRecording,
} from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { audioFilter, frameTimes, mixFilter } from '../src/export/plan.js';

const DUR = 14_000;

const REC: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: DUR, width: 1280, height: 720, mime: 'video/webm' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    { t: 2000, type: 'click', xNorm: 0.3, yNorm: 0.3 },
    { t: 11_000, type: 'click', xNorm: 0.7, yNorm: 0.6 },
  ],
};

const CUTS: CutRegion[] = [
  { tStart: 3000, tEnd: 6000 },
  { tStart: 9000, tEnd: 11_000 },
];

describe('frameTimes', () => {
  it('covers the whole recording when nothing is cut', () => {
    const t = frameTimes([], DUR, 30);
    expect(t).toHaveLength(420);
    expect(t[0]).toBe(0);
    expect(t.at(-1)).toBeCloseTo(DUR - 1000 / 30, 6);
  });

  it('emits exactly the edited length, not the source length', () => {
    const t = frameTimes(CUTS, DUR, 30);
    expect(editedDuration(CUTS, DUR)).toBe(DUR - cutDuration(CUTS));
    expect(t).toHaveLength(Math.round((editedDuration(CUTS, DUR) / 1000) * 30));
  });

  it('never renders a frame from inside a cut', () => {
    for (const t of frameTimes(CUTS, DUR, 30)) {
      for (const c of CUTS) {
        expect(t >= c.tStart && t < c.tEnd).toBe(false);
      }
    }
  });

  it('jumps the source clock across each seam, in order', () => {
    const t = frameTimes(CUTS, DUR, 30);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
    // The frame after 3000ms of kept footage is the far side of the first cut.
    expect(t[90]).toBeCloseTo(6000, 6);
  });

  it('keeps zoom timing correct without remapping keyframes', () => {
    // The zoom planned for the click at 11000 must be at full scale in the
    // frame rendered for source time 11000, however much was cut before it.
    const kfs = planZooms(REC);
    const frame = frameTimes(CUTS, DUR, 30).find((t) => t >= 11_000)!;
    expect(evaluateZoom(kfs, frame).scale).toBeCloseTo(1.8, 2);
  });

  it('honours the frame rate and always emits at least one frame', () => {
    expect(frameTimes([], 1000, 24)).toHaveLength(24);
    expect(frameTimes([{ tStart: 0, tEnd: DUR }], DUR, 30)).not.toHaveLength(0);
  });
});

describe('audioFilter', () => {
  it('passes the whole track through when nothing is cut', () => {
    const f = audioFilter([], DUR)!;
    expect(f).toContain('atrim=0.000:14.000');
    expect(f).toContain('concat=n=1:v=0:a=1[aout]');
  });

  it('trims and concatenates one stream per kept run', () => {
    const f = audioFilter(CUTS, DUR)!;
    const segs = keptSegments(CUTS, DUR);
    expect(segs).toHaveLength(3);
    expect(f).toContain('atrim=0.000:3.000');
    expect(f).toContain('atrim=6.000:9.000');
    expect(f).toContain('atrim=11.000:14.000');
    expect(f).toContain('[x1_0][x1_1][x1_2]concat=n=3:v=0:a=1[aout]');
  });

  it('resets each segment to zero so they butt together', () => {
    // Without asetpts the concatenated segments keep their original
    // timestamps and the output has silent gaps where the cuts were.
    expect((audioFilter(CUTS, DUR)!.match(/asetpts=N\/SR\/TB/g) ?? []).length).toBe(3);
  });

  it('spans the same runs the frame schedule uses', () => {
    const cuts = normalizeCuts([{ tStart: 0, tEnd: 2000 }], DUR);
    expect(audioFilter(cuts, DUR)).toContain('atrim=2.000:14.000');
    expect(frameTimes(cuts, DUR, 30)[0]).toBe(2000);
  });
});

describe('mixFilter', () => {
  const opts = { tabAudio: true, narration: true, duck: 0.25, gain: 1 };

  it('is nothing at all when there is neither track', () => {
    expect(mixFilter(CUTS, DUR, { ...opts, tabAudio: false, narration: false })).toBeNull();
  });

  it('is the plain splice when there is no narration', () => {
    const f = mixFilter(CUTS, DUR, { ...opts, narration: false })!;
    expect(f).toBe(audioFilter(CUTS, DUR));
    expect(f).not.toContain('amix');
    expect(f).not.toContain('volume');
  });

  it('splices the narration through the same cuts as the picture', () => {
    const f = mixFilter(CUTS, DUR, { ...opts, tabAudio: false })!;
    // Narration is input 2 and gets the identical trim points.
    expect(f).toContain('[2:a]atrim=0.000:3.000');
    expect(f).toContain('[2:a]atrim=6.000:9.000');
    expect(f).toContain('[x2_0][x2_1][x2_2]concat=n=3:v=0:a=1[anarr_raw]');
    expect(f.endsWith('[aout]')).toBe(true);
  });

  it('applies the voice level here, since the mixdown is at unity', () => {
    const f = mixFilter(CUTS, DUR, { ...opts, gain: 0.8 })!;
    expect(f).toContain('volume=0.800[anarr]');
    // Narration alone still ends at the one label ffmpeg maps.
    const solo = mixFilter(CUTS, DUR, { ...opts, tabAudio: false, gain: 0.8 })!;
    expect(solo).toContain('volume=0.800[aout]');
    expect((solo.match(/\[aout\]/g) ?? []).length).toBe(1);
  });

  it('ducks the recording under the voice and mixes without renormalising', () => {
    const f = mixFilter(CUTS, DUR, opts)!;
    expect(f).toContain('volume=0.250[aorig]');
    expect(f).toContain('[aorig][anarr]amix=inputs=2:normalize=0');
    // Exactly one output label, or ffmpeg has nothing to map.
    expect((f.match(/\[aout\]/g) ?? []).length).toBe(1);
  });

  it('keeps the two inputs streams apart', () => {
    const f = mixFilter(CUTS, DUR, opts)!;
    expect((f.match(/x1_/g) ?? []).length).toBeGreaterThan(0);
    expect((f.match(/x2_/g) ?? []).length).toBeGreaterThan(0);
    // A shared tag would make the graph ambiguous.
    expect(f).not.toContain('[a0]');
  });
});
