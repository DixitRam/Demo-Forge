import type { ZoomKeyframe } from '@demoforge/core';
import { useRef } from 'react';

export type DragMode = 'move' | 'start' | 'end';

/** Below this a pill cannot hold two handles and a draggable body. */
const COMPACT_PX = 34;

interface Props {
  kf: ZoomKeyframe;
  leftPx: number;
  widthPx: number;
  pxPerMs: number;
  selected: boolean;
  onSelect: () => void;
  onDrag: (mode: DragMode, deltaMs: number) => void;
  onDragEnd: () => void;
}

export default function ZoomPill({
  kf,
  leftPx,
  widthPx,
  pxPerMs,
  selected,
  onSelect,
  onDrag,
  onDragEnd,
}: Props) {
  const origin = useRef(0);

  const begin = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    origin.current = e.clientX;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent): void => {
      onDrag(mode, pxPerMs > 0 ? (ev.clientX - origin.current) / pxPerMs : 0);
    };
    const up = (): void => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      onDragEnd();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const compact = widthPx < COMPACT_PX;

  return (
    <div
      onPointerDown={begin('move')}
      style={{ left: leftPx, width: Math.max(6, widthPx) }}
      className={`absolute inset-y-1 flex cursor-grab items-center justify-between overflow-hidden rounded-md border text-[10px] font-medium select-none active:cursor-grabbing ${
        selected
          ? 'border-sky-300 bg-sky-500/40 text-sky-50 ring-1 ring-sky-300/60'
          : 'border-sky-500/50 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
      }`}
      title={`${(kf.tStart / 1000).toFixed(2)}s – ${(kf.tEnd / 1000).toFixed(2)}s · ${kf.scale.toFixed(2)}×`}
    >
      <span
        onPointerDown={begin('start')}
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-sky-300/70"
      />
      {!compact && (
        <span className="pointer-events-none flex items-center gap-1 truncate px-1">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {kf.scale.toFixed(2)}×
        </span>
      )}
      <span
        onPointerDown={begin('end')}
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-sky-300/70"
      />
    </div>
  );
}
