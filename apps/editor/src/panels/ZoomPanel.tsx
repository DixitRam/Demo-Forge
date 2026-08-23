import { DEFAULT_ZOOM_CONFIG, type ZoomKeyframe } from '@demoforge/core';
import { setScale } from '../timeline/kfOps.js';

interface Props {
  keyframes: ZoomKeyframe[];
  setKeyframes: (kfs: ZoomKeyframe[]) => void;
  selected: number | null;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  onReplan: () => void;
}

export default function ZoomPanel({
  keyframes,
  setKeyframes,
  selected,
  enabled,
  setEnabled,
  onReplan,
}: Props) {
  const kf = selected === null ? null : keyframes[selected];
  const scale = kf?.scale ?? DEFAULT_ZOOM_CONFIG.zoomScale;

  const applyScale = (v: number): void => {
    if (selected !== null) setKeyframes(setScale(keyframes, selected, v));
    else setKeyframes(keyframes.map((k) => ({ ...k, scale: v })));
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <label className="flex items-center justify-between">
        <span className="font-medium text-slate-300">Auto-zoom</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-sky-400"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-slate-400">
          <span>{kf ? `Zoom ${selected! + 1} scale` : 'All zooms scale'}</span>
          <span className="font-mono">{scale.toFixed(2)}×</span>
        </span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => applyScale(Number(e.target.value))}
          className="accent-sky-400"
        />
      </label>

      {kf && (
        <dl className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-500">
          <dt>start</dt>
          <dd className="text-right text-slate-300">{(kf.tStart / 1000).toFixed(2)}s</dd>
          <dt>end</dt>
          <dd className="text-right text-slate-300">{(kf.tEnd / 1000).toFixed(2)}s</dd>
          <dt>target</dt>
          <dd className="text-right text-slate-300">
            {kf.targetXNorm.toFixed(2)}, {kf.targetYNorm.toFixed(2)}
          </dd>
        </dl>
      )}

      <button
        onClick={onReplan}
        className="rounded bg-slate-800 px-2 py-1.5 text-slate-200 hover:bg-slate-700"
      >
        Re-plan from click log
      </button>
    </div>
  );
}
