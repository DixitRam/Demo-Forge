import { effectiveTrim, clampTrim, type CaptionCue, type DemoRecording, type Trim, type ZoomKeyframe } from '@demoforge/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { captionSlotAt, insertCaption, moveCaption } from './captionOps.js';
import { applyDrag, freeSlotAt, insertZoom, snapWithin, type DragMode } from './kfOps.js';
import Pill from './Pill.js';
import { fullView, panView, revealTime, zoomView, type View } from './view.js';

export type Selection = { kind: 'zoom' | 'caption'; index: number } | null;

const TICK_STEPS_MS = [
  100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
];
const MIN_LABEL_GAP_PX = 68;
const LANE_LABEL_W = 62;

interface Props {
  rec: DemoRecording;
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  captions: CaptionCue[];
  setCaptions: (c: CaptionCue[]) => void;
  trim: Trim | null;
  setTrim: (t: Trim | null) => void;
  timeMs: number;
  onSeek: (ms: number) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  mediaName: string;
  /** Bumped by the Z / C shortcuts. */
  addZoomSignal: number;
  addCaptionSignal: number;
}

function label(ms: number, sub: boolean): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(sub ? 1 : 0).padStart(sub ? 4 : 2, '0')}`;
}

export default function Timeline({
  rec,
  keyframes,
  setKeyframes,
  captions,
  setCaptions,
  trim,
  setTrim,
  timeMs,
  onSeek,
  selection,
  onSelect,
  mediaName,
  addZoomSignal,
  addCaptionSignal,
}: Props) {
  const keep = effectiveTrim(trim, Math.max(1, rec.video.durationMs));
  const trimmed = trim !== null;
  const selZoom = selection?.kind === 'zoom' ? selection.index : null;
  const selCaption = selection?.kind === 'caption' ? selection.index : null;
  const duration = Math.max(1, rec.video.durationMs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<View>(() => fullView(duration));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = view.end - view.start;
  const pxPerMs = width > 0 ? width / span : 0;
  const toPx = (t: number): number => (t - view.start) * pxPerMs;
  const toMs = useCallback(
    (clientX: number): number => {
      const r = scrollRef.current?.getBoundingClientRect();
      if (!r || pxPerMs === 0) return view.start;
      return view.start + (clientX - r.left) / pxPerMs;
    },
    [pxPerMs, view.start],
  );

  // Ctrl+Scroll zooms about the pointer, Shift+Scroll pans. Registered by hand
  // because React's onWheel is passive and cannot preventDefault the page zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setView((v) => zoomView(v, duration, toMs(e.clientX), Math.exp(e.deltaY * 0.002)));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setView((v) => panView(v, duration, (d / Math.max(1, width)) * (v.end - v.start)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [duration, toMs, width]);

  // Follow the playhead when it leaves a zoomed-in window.
  useEffect(() => {
    setView((v) => revealTime(v, duration, timeMs));
  }, [timeMs, duration]);

  const clicks = rec.events.filter((e) => e.type === 'click');

  const step =
    TICK_STEPS_MS.find((s) => s * pxPerMs >= MIN_LABEL_GAP_PX) ?? TICK_STEPS_MS.at(-1)!;
  const ticks: number[] = [];
  for (let t = Math.floor(view.start / step) * step; t <= view.end; t += step) {
    if (t >= 0) ticks.push(t);
  }

  const dragBase = useRef<ZoomKeyframe[] | null>(null);
  const capBase = useRef<CaptionCue[] | null>(null);

  const onDrag = (index: number, mode: DragMode, deltaMs: number): void => {
    dragBase.current ??= keyframes;
    const base = dragBase.current;
    setKeyframes(
      applyDrag(base, index, mode, deltaMs, {
        durationMs: duration,
        snapTargets: [
          0,
          duration,
          ...clicks.map((c) => c.t),
          ...base.flatMap((k, i) => (i === index ? [] : [k.tStart, k.tEnd])),
        ],
        tolerance: snapWithin(pxPerMs),
        rec,
      }),
    );
  };

  const trimBase = useRef<Trim | null>(null);

  const onTrimDrag = (edge: 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    trimBase.current = keep;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const at = toMs(ev.clientX);
      const from = trimBase.current!;
      setTrim(
        clampTrim(
          edge === 'start' ? { ...from, startMs: at } : { ...from, endMs: at },
          duration,
        ),
      );
    };
    const up = (): void => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onCaptionDrag = (index: number, mode: DragMode, deltaMs: number): void => {
    capBase.current ??= captions;
    setCaptions(moveCaption(capBase.current, index, mode, deltaMs, duration));
  };

  const addZoomAt = useCallback(
    (t: number): void => {
      const next = insertZoom(keyframes, rec, t);
      if (next.length === keyframes.length) return;
      setKeyframes(next);
      onSelect({ kind: 'zoom', index: next.findIndex((k) => t >= k.tStart && t < k.tEnd) });
    },
    [keyframes, rec, setKeyframes, onSelect],
  );

  const addCaptionAt = useCallback(
    (t: number): void => {
      const next = insertCaption(captions, t, duration);
      if (next.length === captions.length) return;
      setCaptions(next);
      onSelect({ kind: 'caption', index: next.findIndex((c) => t >= c.tStart && t < c.tEnd) });
    },
    [captions, duration, setCaptions, onSelect],
  );

  // App raises these counters when the Z / C shortcuts fire.
  const lastZoom = useRef(addZoomSignal);
  useEffect(() => {
    if (addZoomSignal === lastZoom.current) return;
    lastZoom.current = addZoomSignal;
    addZoomAt(timeMs);
  }, [addZoomSignal, addZoomAt, timeMs]);

  const lastCaption = useRef(addCaptionSignal);
  useEffect(() => {
    if (addCaptionSignal === lastCaption.current) return;
    lastCaption.current = addCaptionSignal;
    addCaptionAt(timeMs);
  }, [addCaptionSignal, addCaptionAt, timeMs]);

  const canAddZoom = freeSlotAt(keyframes, timeMs, duration) !== null;
  const canAddCaption = captionSlotAt(captions, timeMs, duration) !== null;
  const playheadX = toPx(Math.min(timeMs, duration));

  return (
    <div className="select-none">
      <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-slate-500">
        <button
          onClick={() => addZoomAt(timeMs)}
          disabled={!canAddZoom}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          + Zoom <kbd className="text-slate-500">Z</kbd>
        </button>
        <button
          onClick={() => addCaptionAt(timeMs)}
          disabled={!canAddCaption}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          + Caption <kbd className="text-slate-500">C</kbd>
        </button>
        <button
          onClick={() => {
            if (!selection) return;
            if (selection.kind === 'zoom') {
              setKeyframes(keyframes.filter((_, i) => i !== selection.index));
            } else {
              setCaptions(captions.filter((_, i) => i !== selection.index));
            }
            onSelect(null);
          }}
          disabled={!selection}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          Delete
        </button>
        <button
          onClick={() => setTrim(clampTrim({ ...keep, startMs: timeMs }, duration))}
          title="Trim the start to the playhead"
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
        >
          Set in <kbd className="text-slate-500">I</kbd>
        </button>
        <button
          onClick={() => setTrim(clampTrim({ ...keep, endMs: timeMs }, duration))}
          title="Trim the end to the playhead"
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
        >
          Set out <kbd className="text-slate-500">O</kbd>
        </button>
        <button
          onClick={() => setTrim(null)}
          disabled={!trimmed}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          Reset trim
        </button>
        <button
          onClick={() => setView(fullView(duration))}
          className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
        >
          Fit
        </button>
        <span className="ml-auto flex gap-3">
          <span className="rounded bg-slate-900 px-1.5 py-0.5">Shift+Scroll pan</span>
          <span className="rounded bg-slate-900 px-1.5 py-0.5">Ctrl+Scroll zoom</span>
        </span>
      </div>

      <div className="flex">
        <div className="shrink-0 pt-6 pl-4 text-[10px] text-slate-600" style={{ width: LANE_LABEL_W }}>
          <div className="flex h-9 items-center">zoom</div>
          <div className="flex h-8 items-center">caption</div>
          <div className="flex h-7 items-center">clip</div>
        </div>

        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-hidden pr-4">
          {/* Ruler — click or drag anywhere on it to scrub. */}
          <div
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              onSeek(toMs(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) onSeek(toMs(e.clientX));
            }}
            className="relative h-6 cursor-ew-resize border-b border-slate-800"
          >
            {ticks.map((t) => (
              <div
                key={t}
                style={{ left: toPx(t) }}
                className="absolute bottom-0 h-full border-l border-slate-800 pl-1 text-[10px] leading-6 text-slate-500"
              >
                {label(t, step < 1000)}
              </div>
            ))}
            {clicks.map((c, i) => (
              <span
                key={i}
                style={{ left: toPx(c.t) }}
                title={c.el?.text ?? 'click'}
                className="absolute bottom-0 h-2 w-px bg-amber-400/80"
              />
            ))}
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addZoomAt(toMs(e.clientX))}
            className="relative h-9 border-b border-slate-800/60 bg-slate-900/60"
          >
            {keyframes.map((kf, i) => {
              const l = toPx(kf.tStart);
              const w = (kf.tEnd - kf.tStart) * pxPerMs;
              if (l + w < -20 || l > width + 20) return null;
              return (
                <Pill
                  key={i}
                  tone="zoom"
                  leftPx={l}
                  widthPx={w}
                  pxPerMs={pxPerMs}
                  selected={selZoom === i}
                  title={`${(kf.tStart / 1000).toFixed(2)}s – ${(kf.tEnd / 1000).toFixed(2)}s · ${kf.scale.toFixed(2)}×`}
                  label={`${kf.scale.toFixed(2)}×`}
                  onSelect={() => onSelect({ kind: 'zoom', index: i })}
                  onDrag={(mode, delta) => onDrag(i, mode, delta)}
                  onDragEnd={() => {
                    dragBase.current = null;
                  }}
                />
              );
            })}
            {keyframes.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-slate-600">
                Press Z to add a zoom
              </span>
            )}
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addCaptionAt(toMs(e.clientX))}
            className="relative h-8 border-b border-slate-800/60 bg-slate-900/40"
          >
            {captions.map((cue, i) => {
              const l = toPx(cue.tStart);
              const w = (cue.tEnd - cue.tStart) * pxPerMs;
              if (l + w < -20 || l > width + 20) return null;
              return (
                <Pill
                  key={i}
                  tone="caption"
                  leftPx={l}
                  widthPx={w}
                  pxPerMs={pxPerMs}
                  selected={selCaption === i}
                  title={cue.text}
                  label={cue.text}
                  onSelect={() => onSelect({ kind: 'caption', index: i })}
                  onDrag={(mode, delta) => onCaptionDrag(i, mode, delta)}
                  onDragEnd={() => {
                    capBase.current = null;
                  }}
                />
              );
            })}
            {captions.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-slate-600">
                Press C to add a caption
              </span>
            )}
          </div>

          <div className="relative h-7 bg-slate-900/30">
            <div
              style={{ left: toPx(0), width: duration * pxPerMs }}
              className="absolute inset-y-1 flex items-center gap-1.5 overflow-hidden rounded-md border border-slate-700 bg-slate-800/80 px-2 text-[10px] text-slate-300"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="truncate">{mediaName}</span>
            </div>
          </div>

          {/* What the export will drop, shaded across every lane. */}
          <div className="pointer-events-none absolute top-6 right-4 bottom-0 left-0">
            <div
              style={{ left: 0, width: Math.max(0, toPx(keep.startMs)) }}
              className="absolute inset-y-0 bg-slate-950/70"
            />
            <div
              style={{ left: toPx(keep.endMs), right: 0 }}
              className="absolute inset-y-0 bg-slate-950/70"
            />
          </div>
          {(['start', 'end'] as const).map((edge) => (
            <div
              key={edge}
              onPointerDown={onTrimDrag(edge)}
              style={{ left: toPx(edge === 'start' ? keep.startMs : keep.endMs) }}
              title={edge === 'start' ? 'Drag the in point' : 'Drag the out point'}
              className="absolute top-6 bottom-0 z-10 -ml-1 w-2 cursor-ew-resize"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-amber-400" />
              <span className="absolute top-0 left-1/2 h-3 w-2 -translate-x-1/2 rounded-b-sm bg-amber-400" />
            </div>
          ))}

          {/* Playhead spans every lane. */}
          <div
            style={{ left: playheadX }}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-sky-300"
          >
            <span className="absolute -top-0.5 -left-[5px] h-2.5 w-2.5 rounded-sm bg-sky-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
