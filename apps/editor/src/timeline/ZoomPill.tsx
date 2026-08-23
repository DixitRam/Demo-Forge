import type { ZoomKeyframe } from '@demoforge/core';
import { useRef } from 'react';

export type DragMode = 'move' | 'start' | 'end';

/** Below this a pill cannot hold two handles and a draggable body. */
const COMPACT_PX = 26;

interface Props {
  kf: ZoomKeyframe;
  durationMs: number;
  selected: boolean;
  onSelect: () => void;
  onDrag: (mode: DragMode, deltaMs: number) => void;
  onDragEnd: () => void;
  /** Lane width in px, for converting a pointer delta into ms. */
  laneWidth: () => number;
}

export default function ZoomPill({
  kf,
  durationMs,
  selected,
  onSelect,
  onDrag,
  onDragEnd,
  laneWidth,
}: Props) {
  const origin = useRef(0);

  const begin = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    origin.current = e.clientX;
    const width = laneWidth();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent): void => {
      onDrag(mode, ((ev.clientX - origin.current) / width) * durationMs);
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

  const left = (kf.tStart / durationMs) * 100;
  const width = ((kf.tEnd - kf.tStart) / durationMs) * 100;
  const compact = (width / 100) * laneWidth() < COMPACT_PX;

  return (
    <div
      onPointerDown={begin('move')}
      style={{ left: `${left}%`, width: `${width}%` }}
      className={`absolute inset-y-1 flex cursor-grab items-center justify-between rounded-md border text-[10px] font-medium select-none active:cursor-grabbing ${
        selected
          ? 'border-sky-300 bg-sky-500/40 text-sky-50'
          : 'border-sky-500/50 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
      }`}
      title={`${(kf.tStart / 1000).toFixed(2)}s – ${(kf.tEnd / 1000).toFixed(2)}s · ${kf.scale.toFixed(2)}×`}
    >
      <span
        onPointerDown={begin('start')}
        className="h-full w-1.5 shrink-0 cursor-ew-resize rounded-l-md bg-sky-300/70"
      />
      {!compact && (
        <span className="pointer-events-none truncate px-1">{kf.scale.toFixed(1)}×</span>
      )}
      <span
        onPointerDown={begin('end')}
        className="h-full w-1.5 shrink-0 cursor-ew-resize rounded-r-md bg-sky-300/70"
      />
    </div>
  );
}
