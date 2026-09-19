import type { ReactNode } from 'react';
import { useRef } from 'react';

export type DragMode = 'move' | 'start' | 'end';

/** Below this a pill cannot hold two handles and a draggable body. */
const COMPACT_PX = 34;
/** Room for the second line — the time range — under the label. */
const TWO_LINE_PX = 76;

const TONES = {
  zoom: {
    on: 'border-violet-500 bg-violet-500/30 text-fg ring-2 ring-violet-500/30',
    off: 'border-violet-500/30 bg-violet-500/15 text-fg hover:bg-violet-500/25',
    grip: 'bg-violet-500/70',
  },
  cut: {
    on: 'border-red-500 bg-red-500/30 text-fg ring-2 ring-red-500/30',
    off: 'border-red-500/30 bg-red-500/15 text-fg hover:bg-red-500/25',
    grip: 'bg-red-500/70',
  },
  voice: {
    on: 'border-emerald-500 bg-emerald-500/30 text-fg ring-2 ring-emerald-500/30',
    off: 'border-emerald-500/30 bg-emerald-500/15 text-fg hover:bg-emerald-500/25',
    grip: 'bg-emerald-500/70',
  },
  caption: {
    on: 'border-amber-500 bg-amber-500/30 text-fg ring-2 ring-amber-500/30',
    off: 'border-amber-500/30 bg-amber-500/15 text-fg hover:bg-amber-500/25',
    grip: 'bg-amber-500/70',
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
      className={`absolute inset-y-1 flex cursor-grab items-center justify-between overflow-hidden rounded-xl border text-[11px] font-medium select-none active:cursor-grabbing ${
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
