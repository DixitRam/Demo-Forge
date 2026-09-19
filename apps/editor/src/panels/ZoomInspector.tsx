import type { DemoRecording, ZoomKeyframe } from '@demoforge/core';
import { resetFocus, setFocusMode, setScale } from '../timeline/kfOps.js';
import { IconZoom } from './icons.js';

const LEVELS = [1.2, 1.4, 1.6, 1.8, 2, 2.25, 2.5, 3];

interface Props {
  rec: DemoRecording;
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  index: number;
  onClose: () => void;
  onDelete: () => void;
}

export default function ZoomInspector({
  rec,
  keyframes,
  setKeyframes,
  index,
  onClose,
  onDelete,
}: Props) {
  const kf = keyframes[index];
  if (!kf) return null;
  const mode = kf.focus === 'manual' ? 'manual' : 'auto';

  return (
    <div className="absolute top-4 right-4 z-10 w-64 rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-4 text-xs shadow-2xl shadow-black/50 backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-blue-300">
          <IconZoom />
        </span>
        <h3 className="text-sm font-semibold text-zinc-100">Zoom {index + 1}</h3>
        <button
          onClick={onClose}
          title="Close"
          className="ml-auto rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between">
          <span className="text-zinc-400">Zoom level</span>
          <select
            value={LEVELS.includes(kf.scale) ? String(kf.scale) : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return;
              setKeyframes(setScale(keyframes, index, Number(e.target.value)));
            }}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100"
          >
            {!LEVELS.includes(kf.scale) && <option value="custom">{kf.scale.toFixed(2)}×</option>}
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.toFixed(2)}×
              </option>
            ))}
          </select>
        </label>

        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={kf.scale}
          onChange={(e) => setKeyframes(setScale(keyframes, index, Number(e.target.value)))}
          className="accent-blue-400"
        />

        <label className="flex items-center justify-between">
          <span className="text-zinc-400">Focus mode</span>
          <select
            value={mode}
            onChange={(e) =>
              setKeyframes(setFocusMode(keyframes, index, e.target.value as 'auto' | 'manual', rec))
            }
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100"
          >
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </label>

        <p className="leading-relaxed text-zinc-500">
          {mode === 'auto'
            ? 'Aimed at the nearest click, and re-aimed if you drag it along the timeline.'
            : 'Click or drag on the preview to aim this zoom.'}
        </p>

        <button
          onClick={() => setKeyframes(resetFocus(keyframes, index, rec))}
          disabled={mode === 'auto'}
          className="rounded-lg bg-zinc-800 py-2 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
        >
          Reset focus point
        </button>

        <button
          onClick={onDelete}
          className="rounded-lg border border-red-500/40 bg-red-500/10 py-2 text-red-300 hover:bg-red-500/20"
        >
          Delete zoom
        </button>
      </div>
    </div>
  );
}
