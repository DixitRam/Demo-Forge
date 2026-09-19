import {
  lineDuration,
  normalizeCuts,
  type CaptionCue,
  type CutRegion,
  type DemoRecording,
  type ScriptLine,
  type ZoomKeyframe,
} from '@demoforge/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { insertCaption, moveCaption } from './captionOps.js';
import { applyDrag, insertZoom, snapWithin, type DragMode } from './kfOps.js';
import { insertLine, moveLine } from './scriptOps.js';
import Pill from './Pill.js';
import { IconFilm } from '../panels/icons.js';
import { fullView, panView, revealTime, zoomView, type View } from './view.js';

export type Selection = { kind: 'zoom' | 'caption' | 'cut' | 'script'; index: number } | null;

const TICK_STEPS_MS = [
  100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
];
const MIN_LABEL_GAP_PX = 68;
/** A fresh cut is this long; drag its edges from there. */
const DEFAULT_CUT_MS = 2000;

const LANE = 'relative h-11';

/** "1.2s – 4.6s": the second line on a pill. */
const rangeLabel = (a: number, b: number): string => `${(a / 1000).toFixed(1)}s – ${(b / 1000).toFixed(1)}s`;

interface Props {
  rec: DemoRecording;
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  captions: CaptionCue[];
  setCaptions: (c: CaptionCue[]) => void;
  cuts: CutRegion[];
  setCuts: (c: CutRegion[]) => void;
  script: ScriptLine[];
  setScript: (s: ScriptLine[]) => void;
  /** Words per minute, for laying out lines that have not been spoken yet. */
  wpm: number;
  timeMs: number;
  onSeek: (ms: number) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  mediaName: string;
  /** Bumped by the Z / C / T shortcuts. */
  addZoomSignal: number;
  addCaptionSignal: number;
  addCutSignal: number;
  addLineSignal: number;
  /** Bumped to show the whole recording again. */
  fitSignal: number;
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
  cuts,
  setCuts,
  script,
  setScript,
  wpm,
  timeMs,
  onSeek,
  selection,
  onSelect,
  mediaName,
  addZoomSignal,
  addCaptionSignal,
  addCutSignal,
  addLineSignal,
  fitSignal,
}: Props) {
  const selZoom = selection?.kind === 'zoom' ? selection.index : null;
  const selCaption = selection?.kind === 'caption' ? selection.index : null;
  const selCut = selection?.kind === 'cut' ? selection.index : null;
  const selLine = selection?.kind === 'script' ? selection.index : null;
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

  const lineBase = useRef<ScriptLine[] | null>(null);

  const onLineDrag = (index: number, _mode: DragMode, deltaMs: number): void => {
    lineBase.current ??= script;
    setScript(moveLine(lineBase.current, index, deltaMs, duration));
  };

  const cutBase = useRef<CutRegion[] | null>(null);

  const onCutDrag = (index: number, mode: DragMode, deltaMs: number): void => {
    cutBase.current ??= cuts;
    const base = cutBase.current;
    const cut = base[index];
    if (!cut) return;
    const span = cut.tEnd - cut.tStart;
    const next = [...base];
    next[index] =
      mode === 'move'
        ? { tStart: cut.tStart + deltaMs, tEnd: cut.tStart + deltaMs + span }
        : mode === 'start'
          ? { tStart: cut.tStart + deltaMs, tEnd: cut.tEnd }
          : { tStart: cut.tStart, tEnd: cut.tEnd + deltaMs };
    setCuts(normalizeCuts(next, duration));
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

  const addCutAt = useCallback(
    (t: number): void => {
      const next = normalizeCuts([...cuts, { tStart: t, tEnd: t + DEFAULT_CUT_MS }], duration);
      setCuts(next);
      onSelect({ kind: 'cut', index: next.findIndex((c) => t >= c.tStart && t < c.tEnd) });
    },
    [cuts, duration, setCuts, onSelect],
  );

  const addLineAt = useCallback(
    (t: number): void => {
      const next = insertLine(script, t, duration);
      setScript(next);
      onSelect({ kind: 'script', index: next.findIndex((l) => l.tStart === Math.min(Math.max(0, t), duration)) });
    },
    [script, duration, setScript, onSelect],
  );

  const lastLine = useRef(addLineSignal);
  useEffect(() => {
    if (addLineSignal === lastLine.current) return;
    lastLine.current = addLineSignal;
    addLineAt(timeMs);
  }, [addLineSignal, addLineAt, timeMs]);

  const lastFit = useRef(fitSignal);
  useEffect(() => {
    if (fitSignal === lastFit.current) return;
    lastFit.current = fitSignal;
    setView(fullView(duration));
  }, [fitSignal, duration]);

  const lastCut = useRef(addCutSignal);
  useEffect(() => {
    if (addCutSignal === lastCut.current) return;
    lastCut.current = addCutSignal;
    addCutAt(timeMs);
  }, [addCutSignal, addCutAt, timeMs]);

  const playheadX = toPx(Math.min(timeMs, duration));

  return (
    <div className="select-none px-4">
      <div className="flex">
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-hidden">
          {/* Ruler — click or drag anywhere on it to scrub. */}
          <div
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              onSeek(toMs(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) onSeek(toMs(e.clientX));
            }}
            className="relative mb-1 h-7 cursor-ew-resize"
          >
            {ticks.map((t) => (
              <div
                key={t}
                style={{ left: toPx(t) }}
                className="absolute bottom-1 h-1 w-1 -translate-x-1/2 rounded-full bg-faint"
              />
            ))}
            {ticks.map((t) => (
              <div
                key={`l${t}`}
                style={{ left: toPx(t) }}
                className={`absolute top-1 text-[10px] text-muted tabular-nums ${t > 0 ? "-translate-x-1/2" : "pl-1"}`}
              >
                {label(t, step < 1000)}
              </div>
            ))}
            {clicks.map((c, i) => (
              <span
                key={i}
                style={{ left: toPx(c.t) }}
                title={c.el?.text ?? 'click'}
                className="absolute bottom-0.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-blue-500"
              />
            ))}
          </div>

          <div className="relative h-12">
            <div
              style={{ left: toPx(0), width: duration * pxPerMs }}
              className="absolute inset-y-1 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-sky-500/30 bg-sky-500/15 text-[11px] font-medium text-fg"
            >
              <span className="flex max-w-full items-center gap-1.5 truncate px-2">
                <IconFilm /> {mediaName}
              </span>
              <span className="text-[9px] font-normal text-muted">{rangeLabel(0, duration)}</span>
            </div>
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addZoomAt(toMs(e.clientX))}
            className={LANE}
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
                  label={`${kf.scale.toFixed(1)}×`}
                  sub={rangeLabel(kf.tStart, kf.tEnd)}
                  onSelect={() => onSelect({ kind: 'zoom', index: i })}
                  onDrag={(mode, delta) => onDrag(i, mode, delta)}
                  onDragEnd={() => {
                    dragBase.current = null;
                  }}
                />
              );
            })}
            {keyframes.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-faint/80">
                Press Z to add a zoom
              </span>
            )}
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addCutAt(toMs(e.clientX))}
            className={LANE}
          >
            {cuts.map((cut, i) => {
              const l = toPx(cut.tStart);
              const w = (cut.tEnd - cut.tStart) * pxPerMs;
              if (l + w < -20 || l > width + 20) return null;
              return (
                <Pill
                  key={i}
                  tone="cut"
                  leftPx={l}
                  widthPx={w}
                  pxPerMs={pxPerMs}
                  selected={selCut === i}
                  title={`Skips ${((cut.tEnd - cut.tStart) / 1000).toFixed(1)}s of source`}
                  label={`Cut ${((cut.tEnd - cut.tStart) / 1000).toFixed(1)}s`}
                  sub={rangeLabel(cut.tStart, cut.tEnd)}
                  onSelect={() => onSelect({ kind: 'cut', index: i })}
                  onDrag={(mode, delta) => onCutDrag(i, mode, delta)}
                  onDragEnd={() => {
                    cutBase.current = null;
                  }}
                />
              );
            })}
            {cuts.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-faint/80">
                Press T to cut a section out
              </span>
            )}
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addCaptionAt(toMs(e.clientX))}
            className={LANE}
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
                  sub={rangeLabel(cue.tStart, cue.tEnd)}
                  onSelect={() => onSelect({ kind: 'caption', index: i })}
                  onDrag={(mode, delta) => onCaptionDrag(i, mode, delta)}
                  onDragEnd={() => {
                    capBase.current = null;
                  }}
                />
              );
            })}
            {captions.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-faint/80">
                Press C to add a caption
              </span>
            )}
          </div>

          <div
            onPointerDown={() => onSelect(null)}
            onDoubleClick={(e) => addLineAt(toMs(e.clientX))}
            className={LANE}
          >
            {script.map((line, i) => {
              const l = toPx(line.tStart);
              const w = lineDuration(line, wpm) * pxPerMs;
              if (l + w < -20 || l > width + 20) return null;
              return (
                <Pill
                  key={i}
                  tone="voice"
                  leftPx={l}
                  widthPx={w}
                  pxPerMs={pxPerMs}
                  selected={selLine === i}
                  handles={false}
                  title={`${line.text}${line.audioMs === undefined ? ' (length estimated)' : ''}`}
                  label={line.text}
                  onSelect={() => onSelect({ kind: 'script', index: i })}
                  onDrag={(mode, delta) => onLineDrag(i, mode, delta)}
                  onDragEnd={() => {
                    lineBase.current = null;
                  }}
                />
              );
            })}
            {script.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-faint/80">
                Press N to add a narration line
              </span>
            )}
          </div>

          {/* What the export will drop, shaded across every lane. */}
          <div className="pointer-events-none absolute top-7 right-0 bottom-0 left-0">
            {cuts.map((cut, i) => (
              <div
                key={i}
                style={{ left: toPx(cut.tStart), width: (cut.tEnd - cut.tStart) * pxPerMs }}
                className="absolute inset-y-0 border-x border-red-400/40 bg-app/65"
              />
            ))}
          </div>

          {/* Playhead spans every lane. */}
          <div
            style={{ left: playheadX }}
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-blue-600"
          >
            <span className="absolute top-0.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-600 ring-2 ring-panel" />
          </div>
        </div>
      </div>
    </div>
  );
}
