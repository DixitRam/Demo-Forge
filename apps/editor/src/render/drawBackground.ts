import type { FrameStyle } from './style.js';
import { getWallpaper, paintWallpaper } from './wallpapers.js';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: FrameStyle,
): void {
  const bg = style.background;

  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (bg.kind === 'gradient') {
    // 0deg = top to bottom, 90deg = left to right.
    const a = (bg.angle * Math.PI) / 180;
    const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    const dx = (Math.sin(a) * len) / 2;
    const dy = (Math.cos(a) * len) / 2;
    const g = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (bg.kind === 'wallpaper') {
    paintWallpaper(ctx, w, h, getWallpaper(bg.id));
    return;
  }

  // Uploaded image: cover the canvas, cropping the overflow.
  const img = bg.image;
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const cover = Math.max(w / iw, h / ih);
  const dw = iw * cover;
  const dh = ih * cover;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  if (img.complete) ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
