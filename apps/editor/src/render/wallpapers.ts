/**
 * Wallpaper backgrounds, generated rather than shipped.
 *
 * Each is a base colour with a few soft radial blobs over it — enough to read
 * as one of those abstract desktop wallpapers, at any resolution, with no
 * binary assets in the repo and nothing to load at runtime. The same function
 * paints the grid thumbnail and the full frame, so the swatch never lies.
 */

export interface Wallpaper {
  id: string;
  name: string;
  base: string;
  blobs: Array<{ x: number; y: number; r: number; color: string }>;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'crimson',
    name: 'Crimson',
    base: '#2b0a14',
    blobs: [
      { x: 0.15, y: 0.2, r: 0.8, color: '#c0304a' },
      { x: 0.85, y: 0.9, r: 0.7, color: '#4a0d22' },
    ],
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    base: '#0b1a3a',
    blobs: [
      { x: 0.8, y: 0.15, r: 0.75, color: '#2563eb' },
      { x: 0.1, y: 0.85, r: 0.7, color: '#7c3aed' },
    ],
  },
  {
    id: 'coral',
    name: 'Coral',
    base: '#1b1030',
    blobs: [
      { x: 0.2, y: 0.75, r: 0.85, color: '#f97362' },
      { x: 0.85, y: 0.2, r: 0.6, color: '#6d28d9' },
    ],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    base: '#05070f',
    blobs: [
      { x: 0.7, y: 0.3, r: 0.7, color: '#3b6ea5' },
      { x: 0.2, y: 0.9, r: 0.6, color: '#2b3f6b' },
    ],
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    base: '#062a35',
    blobs: [
      { x: 0.25, y: 0.3, r: 0.8, color: '#0ea5e9' },
      { x: 0.9, y: 0.85, r: 0.6, color: '#065f46' },
    ],
  },
  {
    id: 'ember',
    name: 'Ember',
    base: '#1c0f0a',
    blobs: [
      { x: 0.8, y: 0.25, r: 0.8, color: '#ea580c' },
      { x: 0.1, y: 0.8, r: 0.6, color: '#7f1d1d' },
    ],
  },
  {
    id: 'indigo',
    name: 'Indigo',
    base: '#0e1030',
    blobs: [
      { x: 0.5, y: 0.1, r: 0.9, color: '#4338ca' },
      { x: 0.2, y: 0.95, r: 0.6, color: '#1e1b4b' },
    ],
  },
  {
    id: 'orchid',
    name: 'Orchid',
    base: '#1a0b24',
    blobs: [
      { x: 0.75, y: 0.7, r: 0.85, color: '#c026d3' },
      { x: 0.15, y: 0.2, r: 0.6, color: '#4c1d95' },
    ],
  },
  {
    id: 'meadow',
    name: 'Meadow',
    base: '#07210f',
    blobs: [
      { x: 0.3, y: 0.8, r: 0.85, color: '#65a30d' },
      { x: 0.85, y: 0.2, r: 0.6, color: '#0f766e' },
    ],
  },
  {
    id: 'violet',
    name: 'Violet',
    base: '#160a2b',
    blobs: [
      { x: 0.2, y: 0.25, r: 0.8, color: '#8b5cf6' },
      { x: 0.9, y: 0.8, r: 0.65, color: '#2e1065' },
    ],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    base: '#2a1206',
    blobs: [
      { x: 0.15, y: 0.85, r: 0.9, color: '#fb923c' },
      { x: 0.8, y: 0.15, r: 0.6, color: '#9d174d' },
    ],
  },
  {
    id: 'spectrum',
    name: 'Spectrum',
    base: '#08131f',
    blobs: [
      { x: 0.2, y: 0.3, r: 0.6, color: '#22d3ee' },
      { x: 0.6, y: 0.7, r: 0.6, color: '#a3e635' },
      { x: 0.9, y: 0.2, r: 0.5, color: '#818cf8' },
    ],
  },
  {
    id: 'pine',
    name: 'Pine',
    base: '#0a1712',
    blobs: [
      { x: 0.7, y: 0.75, r: 0.8, color: '#14532d' },
      { x: 0.2, y: 0.15, r: 0.55, color: '#334155' },
    ],
  },
  {
    id: 'blush',
    name: 'Blush',
    base: '#f7eef4',
    blobs: [
      { x: 0.25, y: 0.3, r: 0.8, color: '#f9a8d4' },
      { x: 0.85, y: 0.8, r: 0.6, color: '#c7d2fe' },
    ],
  },
  {
    id: 'haze',
    name: 'Haze',
    base: '#eef4fa',
    blobs: [
      { x: 0.75, y: 0.25, r: 0.85, color: '#93c5fd' },
      { x: 0.15, y: 0.85, r: 0.6, color: '#e9d5ff' },
    ],
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    base: '#2a0d16',
    blobs: [
      { x: 0.6, y: 0.5, r: 0.9, color: '#be123c' },
      { x: 0.05, y: 0.05, r: 0.5, color: '#111827' },
    ],
  },
  {
    id: 'canyon',
    name: 'Canyon',
    base: '#2b1408',
    blobs: [
      { x: 0.3, y: 0.2, r: 0.8, color: '#d97706' },
      { x: 0.8, y: 0.9, r: 0.7, color: '#78350f' },
    ],
  },
  {
    id: 'arctic',
    name: 'Arctic',
    base: '#0b2230',
    blobs: [
      { x: 0.5, y: 0.85, r: 0.9, color: '#38bdf8' },
      { x: 0.85, y: 0.1, r: 0.55, color: '#e0f2fe' },
    ],
  },
];

export function getWallpaper(id: string): Wallpaper {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]!;
}

/** Rough perceived brightness of a #rrggbb colour, 0..1. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Paint a wallpaper to fill w x h. Used for both the frame and the swatch. */
export function paintWallpaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  wp: Wallpaper,
): void {
  ctx.fillStyle = wp.base;
  ctx.fillRect(0, 0, w, h);

  const reach = Math.hypot(w, h);
  ctx.save();
  // Additive blending gives dark wallpapers their glow, but on a light base it
  // just saturates everything to white — those blend normally instead.
  ctx.globalCompositeOperation = luminance(wp.base) > 0.45 ? 'source-over' : 'lighter';
  for (const b of wp.blobs) {
    const r = b.r * reach * 0.6;
    const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, r);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

const thumbCache = new Map<string, string>();

/** A data: URL swatch for the picker grid, painted by the same function. */
export function wallpaperThumb(wp: Wallpaper): string {
  const hit = thumbCache.get(wp.id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  paintWallpaper(ctx, c.width, c.height, wp);
  const url = c.toDataURL('image/png');
  thumbCache.set(wp.id, url);
  return url;
}
