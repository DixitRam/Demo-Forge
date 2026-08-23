import { scriptSteps } from '@demoforge/core';
import type { DemoRecording } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { describeStep, fitToBudget, thinFrames } from '../vite-script.js';
import { frameTimeMs } from '../src/voice/writeScript.js';

describe('fitToBudget', () => {
  it('leaves a line that respects its budget', () => {
    expect(fitToBudget('  Open the filters.  ', 5)).toBe('Open the filters.');
  });

  it('drops whole trailing sentences to fit', () => {
    expect(fitToBudget('Open the filters. Then pick a date range.', 4)).toBe('Open the filters.');
  });

  it('never truncates mid-sentence — a long line beats a broken one', () => {
    // Cutting at four words would leave "AirSense monitors air quality for."
    const long = 'AirSense monitors air quality for facilities teams everywhere.';
    expect(fitToBudget(long, 4)).toBe(long);
  });

  it('keeps as many sentences as fit, not just the first', () => {
    expect(fitToBudget('One two. Three four. Five six.', 4)).toBe('One two. Three four.');
  });
});

describe('describeStep', () => {
  const base = { index: 2, tMs: 4200, windowMs: 3000, maxWords: 8, action: 'click' };

  it('states the budget in both seconds and words', () => {
    const d = describeStep({ ...base, tag: 'button', text: 'Submit' });
    expect(d).toContain('Step 2');
    expect(d).toContain('4.2s');
    expect(d).toContain('3.0s before the next step');
    expect(d).toContain('at most 8 words');
    expect(d).toContain('"Submit"');
    expect(d).toContain('<button>');
  });

  it('says what an opening step is rather than describing a click', () => {
    const d = describeStep({ ...base, index: 0, tMs: 0, action: 'open' });
    expect(d).toContain('opening frame');
    expect(d).not.toContain('<');
  });

  it('copes with an element the capture could not name', () => {
    expect(describeStep(base)).toContain('click.');
  });
});

describe('thinFrames', () => {
  const steps = Array.from({ length: 10 }, (_, i) => ({ index: i, frame: `f${i}` }));

  it('keeps every frame when there is room', () => {
    expect(thinFrames(steps, 10).filter((s) => s.frame)).toHaveLength(10);
  });

  it('spreads what it keeps across the whole demo, ends included', () => {
    const kept = thinFrames(steps, 4).filter((s) => s.frame);
    expect(kept).toHaveLength(4);
    // Losing the end would mean writing blind about the last half.
    expect(kept[0]!.index).toBe(0);
    expect(kept.at(-1)!.index).toBe(9);
  });

  it('drops frames, never steps — the text still gets written about', () => {
    expect(thinFrames(steps, 3)).toHaveLength(10);
  });
});

describe('frameTimeMs', () => {
  const REC: DemoRecording = {
    source: 'extension',
    createdAt: '2026-08-23T00:00:00.000Z',
    video: { durationMs: 20_000, width: 1280, height: 720, mime: 'video/webm' },
    viewport: { w: 1280, h: 720, dpr: 1 },
    events: [
      { t: 5000, type: 'click', xNorm: 0.5, yNorm: 0.5, el: { tag: 'button', text: 'Go', rect: { x: 0, y: 0, w: 80, h: 30 } } },
    ],
  };
  const steps = scriptSteps(REC);

  it('grabs a click at the moment it happens, before the UI answers', () => {
    expect(frameTimeMs(steps[1]!)).toBe(5000);
  });

  it('grabs the opening a beat in, past any page load', () => {
    expect(frameTimeMs(steps[0]!)).toBe(500);
  });

  it('does not overshoot a very short opening', () => {
    expect(frameTimeMs({ ...steps[0]!, windowMs: 400 })).toBe(200);
  });
});
