/**
 * Frame styling and render settings.
 *
 * Every length here is a FRACTION of the output's shorter side, never pixels.
 * The preview renders at ~1280px and the exporter at native size, so a pixel
 * radius or shadow would quietly look different in the file you ship than in
 * the editor you tuned it in.
 */

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'wallpaper'; id: string }
  | { kind: 'image'; image: HTMLImageElement };

export interface CursorStyle {
  show: boolean;
  /** Height as a fraction of the output height. */
  size: number;
  /** 0 = snap between clicks, 1 = long lazy glides. */
  smoothing: number;
  /** Draw the ring pulse on click. */
  clicks: boolean;
}

export interface FrameStyle {
  background: Background;
  /** Output aspect ratio (w/h). null keeps the recording's own. */
  aspect: number | null;
  padding: number;
  radius: number;
  shadow: { blur: number; y: number; alpha: number };
  cursor: CursorStyle;
}

export const DEFAULT_STYLE: FrameStyle = {
  background: { kind: 'wallpaper', id: 'cobalt' },
  aspect: null,
  padding: 0.05,
  radius: 0.02,
  shadow: { blur: 0.05, y: 0.018, alpha: 0.5 },
  cursor: { show: true, size: 0.045, smoothing: 0.4, clicks: true },
};

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
export function outputAspect(style: FrameStyle, videoW: number, videoH: number): number {
  return style.aspect ?? (videoH > 0 ? videoW / videoH : 16 / 9);
}

/**
 * Cursor travel time. Exposed as 0..1 "smoothing" in the UI because
 * milliseconds are not what the user is thinking about.
 */
export function cursorMoveMs(smoothing: number): number {
  return 120 + smoothing * 700;
}
