/**
 * The pure shape of a logged event: normalising a click point and describing
 * the element behind it. Kept out of content.ts so it is testable without a
 * DOM — this is the code that guards correctness risk #2 (coordinates).
 */

import type { DemoElement } from '@demoforge/core';

export const MAX_TEXT = 60;

/** Clicks usually land on an inner span; walk up to the thing the user meant. */
export const INTERACTIVE =
  'button,a,input,select,textarea,label,summary,[role],[onclick],[tabindex]';

/** The bits of Element we need — structural, so tests need no jsdom. */
export interface ElementLike {
  tagName: string;
  textContent: string | null;
  closest(selector: string): ElementLike | null;
  getBoundingClientRect(): { x: number; y: number; width: number; height: number };
}

/**
 * Normalise to 0..1 against the CSS-px viewport. This is the ONLY coordinate
 * form we ever store; pixels are the editor's problem, at render time.
 */
export function normPoint(
  clientX: number,
  clientY: number,
  innerWidth: number,
  innerHeight: number,
): { xNorm: number; yNorm: number } {
  return {
    xNorm: clientX / (innerWidth || 1),
    yNorm: clientY / (innerHeight || 1),
  };
}

export function describeElement(target: ElementLike): DemoElement {
  const el = target.closest(INTERACTIVE) ?? target;
  const r = el.getBoundingClientRect();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  const desc: DemoElement = {
    tag: el.tagName.toLowerCase(),
    // CSS px, straight from getBoundingClientRect. The planner uses this only
    // for an area ratio against the CSS-px viewport, where DPR cancels out.
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
  if (text) desc.text = text;
  return desc;
}
