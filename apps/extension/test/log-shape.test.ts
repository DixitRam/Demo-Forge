import { describe, expect, it } from 'vitest';
import { MAX_TEXT, describeElement, normPoint, type ElementLike } from '../src/log-shape.js';

/** Structural stand-in for a DOM element; `closest` returns what we hand it. */
function make(
  tagName: string,
  text: string | null,
  rect: { x: number; y: number; width: number; height: number },
  closestResult: ElementLike | null,
): ElementLike {
  const self: ElementLike = {
    tagName,
    textContent: text,
    getBoundingClientRect: () => rect,
    closest: () => closestResult,
  };
  return self;
}

describe('normPoint', () => {
  it('normalises against the CSS-px viewport', () => {
    expect(normPoint(604.8, 279, 1440, 900)).toEqual({ xNorm: 0.42, yNorm: 0.31 });
  });

  it('gives the same 0..1 point regardless of viewport size or DPR', () => {
    // Same relative spot on a 1440x900 @2x screen and a 1280x800 @1x screen.
    const a = normPoint(0.42 * 1440, 0.31 * 900, 1440, 900);
    const b = normPoint(0.42 * 1280, 0.31 * 800, 1280, 800);
    expect(a.xNorm).toBeCloseTo(b.xNorm, 12);
    expect(a.yNorm).toBeCloseTo(b.yNorm, 12);
  });

  it('does not divide by zero on a collapsed viewport', () => {
    expect(Number.isFinite(normPoint(10, 10, 0, 0).xNorm)).toBe(true);
  });
});

describe('describeElement', () => {
  const rect = { x: 12, y: 34, width: 120, height: 40 };

  it('walks up from an inner span to the interactive ancestor', () => {
    const button = make('BUTTON', ' Add   Widget ', rect, null);
    const span = make('SPAN', 'Add Widget', { x: 20, y: 40, width: 60, height: 16 }, button);
    const d = describeElement(span);
    expect(d.tag).toBe('button');
    expect(d.rect).toEqual({ x: 12, y: 34, w: 120, h: 40 });
  });

  it('falls back to the target when nothing interactive is above it', () => {
    expect(describeElement(make('DIV', 'plain', rect, null)).tag).toBe('div');
  });

  it('collapses whitespace and caps the text at 60 chars', () => {
    const long = make('BUTTON', '  a\n\t b '.repeat(40), rect, null);
    const text = describeElement(long).text!;
    expect(text.length).toBe(MAX_TEXT);
    expect(text).not.toMatch(/\s\s|\n|\t/);
  });

  it('omits text entirely when there is none', () => {
    expect(describeElement(make('INPUT', '   ', rect, null)).text).toBeUndefined();
  });

  it('keeps the rect in CSS px so the planner area ratio is DPR-free', () => {
    const d = describeElement(make('BUTTON', 'x', { x: 0, y: 0, width: 1440, height: 820 }, null));
    expect((d.rect.w * d.rect.h) / (1440 * 900)).toBeCloseTo(0.9111, 4);
  });
});
