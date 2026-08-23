import type { ReactNode } from 'react';
import { useRef } from 'react';

export type DragMode = 'move' | 'start' | 'end';

/** Below this a pill cannot hold two handles and a draggable body. */
const COMPACT_PX = 34;

const TONES = {
  zoom: {
    on: 'border-sky-300 bg-sky-500/40 text-sky-50 ring-1 ring-sky-300/60',
    off: 'border-sky-500/50 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30',
    grip: 'bg-sky-300/70',
  },
  cut: {
    on: 'border-red-300 bg-red-500/40 text-red-50 ring-1 ring-red-300/60',
    off: 'border-red-500/50 bg-red-500/20 text-red-200 hover:bg-red-500/30',
    grip: 'bg-red-300/70',
  },
  voice: {
    on: 'border-violet-300 bg-violet-500/40 text-violet-50 ring-1 ring-violet-300/60',
    off: 'border-violet-500/50 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30',
    grip: 'bg-violet-300/70',
  },
  caption: {
    on: 'border-emerald-300 bg-emerald-500/40 text-emerald-50 ring-1 ring-emerald-300/60',
    off: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30',
    grip: 'bg-emerald-300/70',
  },
} as const;

interface Props {
  tone: keyof typeof TONES;
  leftPx: number;
  widthPx: number;
  pxPerMs: number;
  selected: boolean;
  title: string;
  label: ReactNode;
  onSelect: () => void;
  onDrag: (mode: DragMode, deltaMs: number) => void;
  onDragEnd: () => void;
  /** Off for a pill whose length is not the user's to set — speech, say. */
  handles?: boolean;
}

export default function Pill({
  tone,
  leftPx,
  widthPx,
  pxPerMs,
  selected,
  title,
  label,
  onSelect,
  onDrag,
  onDragEnd,
  handles = true,
}: Props) {
  const origin = useRef(0);
  const t = TONES[tone];

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

  return (
    <div
      onPointerDown={begin('move')}
      style={{ left: leftPx, width: Math.max(6, widthPx) }}
      title={title}
      className={`absolute inset-y-1 flex cursor-grab items-center justify-between overflow-hidden rounded-md border text-[10px] font-medium select-none active:cursor-grabbing ${
        selected ? t.on : t.off
      }`}
    >
      {handles && (
        <span
          onPointerDown={begin('start')}
          className={`h-full w-1.5 shrink-0 cursor-ew-resize ${t.grip}`}
        />
      )}
      {widthPx >= COMPACT_PX && (
        <span className="pointer-events-none flex min-w-0 items-center gap-1 truncate px-1">
          {label}
        </span>
      )}
      {handles && (
        <span
          onPointerDown={begin('end')}
          className={`h-full w-1.5 shrink-0 cursor-ew-resize ${t.grip}`}
        />
      )}
    </div>
  );
}
