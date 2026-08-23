/**
 * Frame styling.
 *
 * Every length here is a FRACTION of the output's shorter side, never pixels.
 * The preview renders at 1280px wide and the exporter at the video's native
 * size, so a pixel radius or shadow would silently look different in the file
 * you ship than in the editor you tuned it in.
 */

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image'; image: HTMLImageElement };

export interface FrameStyle {
  background: Background;
  /** Padding around the video. */
  padding: number;
  /** Corner radius. */
  radius: number;
  shadow: {
    blur: number;
    /** Downward offset. */
    y: number;
    alpha: number;
  };
}

export const DEFAULT_STYLE: FrameStyle = {
  background: { kind: 'gradient', from: '#1e293b', to: '#0b1220', angle: 160 },
  padding: 0.05,
  radius: 0.02,
  shadow: { blur: 0.05, y: 0.018, alpha: 0.5 },
};

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
