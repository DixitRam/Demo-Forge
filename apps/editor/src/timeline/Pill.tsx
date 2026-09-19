import type { ReactNode } from 'react';
import { useRef } from 'react';

export type DragMode = 'move' | 'start' | 'end';

/** Below this a pill cannot hold two handles and a draggable body. */
const COMPACT_PX = 34;
/** Room for the second line — the time range — under the label. */
const TWO_LINE_PX = 76;

const TONES = {
  zoom: {
    on: 'border-blue-300 bg-blue-500/45 text-white ring-2 ring-blue-300/50',
    off: 'border-blue-500/40 bg-blue-500/25 text-blue-50 hover:bg-blue-500/35',
    grip: 'bg-blue-400',
  },
  cut: {
    on: 'border-red-300 bg-red-500/45 text-white ring-2 ring-red-300/50',
    off: 'border-red-500/40 bg-red-500/25 text-red-50 hover:bg-red-500/35',
    grip: 'bg-red-400',
  },
  voice: {
    on: 'border-violet-300 bg-violet-500/45 text-white ring-2 ring-violet-300/50',
    off: 'border-violet-500/40 bg-violet-500/25 text-violet-50 hover:bg-violet-500/35',
    grip: 'bg-violet-400',
  },
  caption: {
    on: 'border-emerald-300 bg-emerald-500/45 text-white ring-2 ring-emerald-300/50',
    off: 'border-emerald-500/40 bg-emerald-500/25 text-emerald-50 hover:bg-emerald-500/35',
    grip: 'bg-emerald-400',
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
  /** Second line, shown when the pill is wide enough — a time range, say. */
  sub?: string;
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
  sub,
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
      className={`absolute inset-y-1 flex cursor-grab items-center justify-between overflow-hidden rounded-lg border text-[11px] font-medium select-none active:cursor-grabbing ${
        selected ? t.on : t.off
      }`}
    >
      {handles && (
        <span
          onPointerDown={begin('start')}
          className={`h-full w-1.5 shrink-0 cursor-ew-resize rounded-sm ${t.grip}`}
        />
      )}
      {widthPx >= COMPACT_PX && (
        <span className="pointer-events-none flex min-w-0 flex-1 flex-col items-center px-1 leading-tight">
          <span className="flex max-w-full items-center gap-1 truncate">{label}</span>
          {sub && widthPx >= TWO_LINE_PX && (
            <span className="max-w-full truncate text-[9px] font-normal opacity-60">{sub}</span>
          )}
        </span>
      )}
      {handles && (
        <span
          onPointerDown={begin('end')}
          className={`h-full w-1.5 shrink-0 cursor-ew-resize rounded-sm ${t.grip}`}
        />
      )}
    </div>
  );
}
