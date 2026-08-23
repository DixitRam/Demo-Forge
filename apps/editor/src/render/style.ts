/**
 * Render settings live in `@demoforge/core` (see project.ts) so a saved
 * project is plain data an agent can edit. This module holds only the
 * editor-side presets and helpers built on top of them.
 */

export type {
  CaptionCue,
  CaptionStyle,
  CursorStyle,
  ProjectBackground as Background,
  ProjectStyle as FrameStyle,
} from '@demoforge/core';
export { DEFAULT_STYLE } from '@demoforge/core';

export const ASPECT_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: 'Original', value: null },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '4:5', value: 4 / 5 },
];

export const GRADIENT_PRESETS: Array<{ name: string; from: string; to: string; angle: number }> = [
  { name: 'Slate', from: '#1e293b', to: '#0b1220', angle: 160 },
  { name: 'Dusk', from: '#4c1d95', to: '#1e1b4b', angle: 140 },
  { name: 'Ember', from: '#7c2d12', to: '#1c1917', angle: 150 },
  { name: 'Mint', from: '#134e4a', to: '#052e2b', angle: 170 },
  { name: 'Paper', from: '#f1f5f9', to: '#cbd5e1', angle: 160 },
];

/** Lengths are fractions of the shorter side; resolve against real output. */
export function unit(w: number, h: number): number {
  return Math.min(w, h);
}

/** Output aspect for a recording under the current style. */
export function outputAspect(
  style: { aspect: number | null },
  videoW: number,
  videoH: number,
): number {
  return style.aspect ?? (videoH > 0 ? videoW / videoH : 16 / 9);
}

/**
 * Cursor travel time. Exposed as 0..1 "smoothing" in the UI because
 * milliseconds are not what the user is thinking about.
 */
export function cursorMoveMs(smoothing: number): number {
  return 120 + smoothing * 700;
}
