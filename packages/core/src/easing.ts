export type Easing = 'linear' | 'easeInOutCubic';

export function ease(kind: Easing, p: number): number {
  const t = clamp01(p);
  if (kind === 'linear') return t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}
