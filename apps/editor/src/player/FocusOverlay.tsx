import { IDLE_ZOOM, pageRect, type DemoViewport, type ZoomKeyframe } from '@demoforge/core';
import { useRef } from 'react';
import { focusBounds, focusRect, stageGeometry } from '../render/geometry.js';
import type { FrameStyle } from '../render/style.js';

interface Props {
  kf: ZoomKeyframe;
  /** Canvas backing-store size, which the overlay is stretched over. */
  canvasW: number;
  canvasH: number;
  videoW: number;
  videoH: number;
  viewport: DemoViewport;
  style: FrameStyle;
  onPlace: (xNorm: number, yNorm: number) => void;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Drag the zoom's focus point directly on the preview.
 *
 * The rectangle is the actual crop window (1/scale of the frame), not a
 * crosshair, so what is inside it is exactly what the zoom will show. It is
 * laid out in percentages of the canvas, so it tracks the preview at whatever
 * size the canvas happens to be displayed.
 */
export default function FocusOverlay({
  kf,
  canvasW,
  canvasH,
  videoW,
  videoH,
  viewport,
  style,
  onPlace,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Where the unzoomed video sits on the canvas — the same maths the
  // compositor uses, so the overlay cannot drift from the picture.
  const stage = stageGeometry(
    canvasW,
    canvasH,
    videoW,
    videoH,
    style.padding,
    IDLE_ZOOM,
    pageRect(viewport, videoW, videoH),
  );
  const pct = (v: number, total: number): string => `${(v / total) * 100}%`;

  const place = (clientX: number, clientY: number): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    const b = focusBounds(kf.scale);
    onPlace(
      clamp((clientX - box.left) / box.width, b.min, b.max),
      clamp((clientY - box.top) / box.height, b.min, b.max),
    );
  };

  const rect = focusRect(kf.scale, kf.targetXNorm, kf.targetYNorm);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        place(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) place(e.clientX, e.clientY);
      }}
      style={{
        left: pct(stage.dx, canvasW),
        top: pct(stage.dy, canvasH),
        width: pct(stage.dw, canvasW),
        height: pct(stage.dh, canvasH),
      }}
      className="absolute cursor-crosshair overflow-hidden"
      title="Click or drag to aim this zoom"
    >
      <div
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
          // An enormous outset shadow, clipped by the overlay's overflow, dims
          // everything the zoom will not show. A clip-path "donut" is the
          // obvious way to do this and silently renders nothing in Chrome.
          boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.6)',
        }}
        className="pointer-events-none absolute border-2 border-sky-400"
      >
        <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300 bg-sky-400/30" />
        <span className="absolute -top-6 left-0 rounded bg-sky-400 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-slate-950">
          {kf.scale.toFixed(2)}× · {kf.focus === 'manual' ? 'manual' : 'auto'}
        </span>
      </div>
    </div>
  );
}
