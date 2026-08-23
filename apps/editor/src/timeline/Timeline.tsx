import type { DemoRecording, ZoomKeyframe } from '@demoforge/core';
import { useEffect, useRef, useState } from 'react';
import { applyDrag, freeSlotAt, insertZoom, snapWithin, type DragMode } from './kfOps.js';
import ZoomPill from './ZoomPill.js';

const TICK_STEPS_MS = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000];
const MIN_LABEL_GAP_PX = 70;

interface Props {
  rec: DemoRecording;
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  timeMs: number;
  onSeek: (ms: number) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export default function Timeline({
  rec,
  keyframes,
  setKeyframes,
  timeMs,
  onSeek,
  selected,
  onSelect,
}: Props) {
  const [laneRef, laneWidth] = useWidth();
  const duration = Math.max(1, rec.video.durationMs);
  const pxPerMs = laneWidth / duration;

  // The array as it was when the current drag began, so a drag is always
  // applied to a stable base rather than compounding frame by frame.
  const dragBase = useRef<ZoomKeyframe[] | null>(null);

  const clicks = rec.events.filter((e) => e.type === 'click');

  // Nice tick spacing: the first step whose labels clear MIN_LABEL_GAP_PX.
  const step =
    TICK_STEPS_MS.find((s) => s * pxPerMs >= MIN_LABEL_GAP_PX) ?? TICK_STEPS_MS.at(-1)!;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * duration);
  };

  const onDrag = (index: number, mode: DragMode, deltaMs: number): void => {
    dragBase.current ??= keyframes;
    const base = dragBase.current;
    const snapTargets = [
      0,
      duration,
      ...clicks.map((c) => c.t),
      ...base.flatMap((k, i) => (i === index ? [] : [k.tStart, k.tEnd])),
    ];
    setKeyframes(
      applyDrag(base, index, mode, deltaMs, {
        durationMs: duration,
        snapTargets,
        tolerance: snapWithin(pxPerMs),
      }),
    );
  };

  const addAtPlayhead = (): void => {
    const next = insertZoom(keyframes, rec, timeMs);
    setKeyframes(next);
    onSelect(next.findIndex((k) => timeMs >= k.tStart && timeMs < k.tEnd));
  };

  const removeSelected = (): void => {
    if (selected === null) return;
    setKeyframes(keyframes.filter((_, i) => i !== selected));
    onSelect(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (document.activeElement?.tagName === 'INPUT') return;
      removeSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canAdd = freeSlotAt(keyframes, timeMs, duration) !== null;

  return (
    <div className="select-none px-4 pb-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="font-medium text-slate-400">Zooms</span>
        <button
          onClick={addAtPlayhead}
          disabled={!canAdd}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          + Add at playhead
        </button>
        <button
          onClick={removeSelected}
          disabled={selected === null}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          Delete
        </button>
        <span className="ml-auto text-slate-600">
          drag to move · edges to resize · double-click the lane to add
        </span>
      </div>

      {/* Ruler: click or drag anywhere to scrub. */}
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromEvent(e);
        }}
        className="relative h-6 cursor-pointer border-b border-slate-800"
      >
        {ticks.map((t) => (
          <div
            key={t}
            style={{ left: `${(t / duration) * 100}%` }}
            className="absolute bottom-0 flex h-full flex-col justify-end border-l border-slate-800 pl-1 text-[10px] text-slate-500"
          >
            {(t / 1000).toFixed(step < 1000 ? 1 : 0)}s
          </div>
        ))}
        {/* Where the clicks actually were — the source of every zoom below. */}
        {clicks.map((c, i) => (
          <span
            key={i}
            style={{ left: `${(c.t / duration) * 100}%` }}
            className="absolute bottom-0 h-1.5 w-px bg-amber-400/70"
          />
        ))}
      </div>

      <div
        ref={laneRef}
        onPointerDown={() => onSelect(null)}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const t = ((e.clientX - r.left) / r.width) * duration;
          const next = insertZoom(keyframes, rec, t);
          setKeyframes(next);
          onSelect(next.findIndex((k) => t >= k.tStart && t < k.tEnd));
        }}
        className="relative h-9 rounded-md bg-slate-900/70"
      >
        {keyframes.map((kf, i) => (
          <ZoomPill
            key={i}
            kf={kf}
            durationMs={duration}
            selected={selected === i}
            onSelect={() => onSelect(i)}
            onDrag={(mode, delta) => onDrag(i, mode, delta)}
            onDragEnd={() => {
              dragBase.current = null;
            }}
            laneWidth={() => laneWidth}
          />
        ))}
        <div
          style={{ left: `${(Math.min(timeMs, duration) / duration) * 100}%` }}
          className="pointer-events-none absolute inset-y-0 w-px bg-sky-300"
        />
      </div>
    </div>
  );
}
