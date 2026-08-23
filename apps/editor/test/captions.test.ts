import type { CaptionCue, DemoRecording } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { captionAt } from '../src/render/drawCaptions.js';
import {
  DEFAULT_CAPTION_MS,
  MIN_CAPTION_MS,
  captionSlotAt,
  captionsFromClicks,
  insertCaption,
  moveCaption,
  setCaptionText,
} from '../src/timeline/captionOps.js';

const DUR = 20_000;

function click(t: number, text?: string) {
  return {
    t,
    type: 'click' as const,
    xNorm: 0.5,
    yNorm: 0.5,
    ...(text ? { el: { tag: 'button', text, rect: { x: 0, y: 0, w: 10, h: 10 } } } : {}),
  };
}

const REC: DemoRecording = {
  source: 'extension',
  createdAt: '2026-08-23T12:00:00.000Z',
  video: { durationMs: DUR, width: 1280, height: 720, mime: 'video/webm' },
  viewport: { w: 1280, h: 720, dpr: 1 },
  events: [
    click(1000, 'Add Widget'),
    click(1200, 'Add Widget'),
    click(5000, 'Save'),
    click(9000),
    { t: 12_000, type: 'scroll', xNorm: 0.5, yNorm: 0.5 },
  ],
};

function assertOrdered(cues: readonly CaptionCue[]): void {
  for (let i = 0; i < cues.length; i++) {
    expect(cues[i]!.tEnd).toBeGreaterThan(cues[i]!.tStart);
    if (i > 0) expect(cues[i - 1]!.tEnd).toBeLessThanOrEqual(cues[i]!.tStart);
  }
}

describe('insertCaption', () => {
  it('adds one at the playhead and keeps the list ordered', () => {
    const out = insertCaption([], 4000, DUR);
    expect(out).toHaveLength(1);
    expect(out[0]!.tStart).toBe(4000);
    expect(out[0]!.tEnd).toBe(4000 + DEFAULT_CAPTION_MS);
    assertOrdered(out);
  });

  it('refuses to stack one on top of another', () => {
    const one = insertCaption([], 4000, DUR);
    expect(insertCaption(one, 5000, DUR)).toEqual(one);
    expect(captionSlotAt(one, 5000, DUR)).toBeNull();
  });

  it('shrinks to fit a gap smaller than the default length', () => {
    const cues = [
      { tStart: 0, tEnd: 3000, text: 'a' },
      { tStart: 4000, tEnd: 8000, text: 'b' },
    ];
    const out = insertCaption(cues, 3200, DUR);
    expect(out).toHaveLength(3);
    assertOrdered(out);
    expect(out[1]!.tEnd).toBeLessThanOrEqual(4000);
  });
});

describe('moveCaption', () => {
  const base: CaptionCue[] = [
    { tStart: 1000, tEnd: 3000, text: 'a' },
    { tStart: 5000, tEnd: 7000, text: 'b' },
  ];

  it('moves without changing length and stops at its neighbour', () => {
    expect(moveCaption(base, 0, 'move', 1000, DUR)[0]).toMatchObject({
      tStart: 2000,
      tEnd: 4000,
    });
    expect(moveCaption(base, 0, 'move', 99_999, DUR)[0]).toMatchObject({
      tStart: 3000,
      tEnd: 5000,
    });
  });

  it('resizes but never below MIN_CAPTION_MS', () => {
    expect(moveCaption(base, 0, 'end', -99_999, DUR)[0]!.tEnd).toBe(1000 + MIN_CAPTION_MS);
    expect(moveCaption(base, 0, 'start', 99_999, DUR)[0]!.tStart).toBe(3000 - MIN_CAPTION_MS);
  });

  it('keeps the list ordered under arbitrary drags', () => {
    for (const i of [0, 1]) {
      for (const mode of ['move', 'start', 'end'] as const) {
        for (const d of [-50_000, -500, 0, 500, 50_000]) {
          assertOrdered(moveCaption(base, i, mode, d, DUR));
        }
      }
    }
  });
});

describe('captionsFromClicks', () => {
  const cues = captionsFromClicks(REC);

  it('drafts one cue per named click, using the recorded element text', () => {
    expect(cues.map((c) => c.text)).toEqual(['Click "Add Widget"', 'Click "Save"']);
  });

  it('treats a repeated click on the same control as one step', () => {
    expect(cues.filter((c) => c.text.includes('Add Widget'))).toHaveLength(1);
  });

  it('skips clicks that named nothing, and non-click events', () => {
    expect(cues.every((c) => c.text !== 'Click ""')).toBe(true);
    expect(cues).toHaveLength(2);
  });

  it('produces a list the editor can use as-is', () => {
    assertOrdered(cues);
    for (const c of cues) expect(c.tEnd).toBeLessThanOrEqual(DUR);
  });
});

describe('captionAt', () => {
  const cues: CaptionCue[] = [
    { tStart: 1000, tEnd: 3000, text: 'first' },
    { tStart: 5000, tEnd: 7000, text: 'second' },
  ];

  it('finds the cue covering a moment, and nothing in the gaps', () => {
    expect(captionAt(cues, 2000)?.text).toBe('first');
    expect(captionAt(cues, 6999)?.text).toBe('second');
    expect(captionAt(cues, 4000)).toBeUndefined();
    expect(captionAt(cues, 3000)).toBeUndefined();
  });
});

describe('setCaptionText', () => {
  it('edits one cue without disturbing its timing or the others', () => {
    const cues: CaptionCue[] = [{ tStart: 1, tEnd: 2, text: 'a' }];
    const out = setCaptionText(cues, 0, 'b');
    expect(out[0]).toEqual({ tStart: 1, tEnd: 2, text: 'b' });
    expect(cues[0]!.text).toBe('a');
  });
});
