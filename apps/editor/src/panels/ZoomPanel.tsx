import { DEFAULT_ZOOM_CONFIG, type ZoomKeyframe } from '@demoforge/core';
import { setScale } from '../timeline/kfOps.js';
import { Section, Slider, Toggle } from './controls.js';

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
    <div className="flex flex-col gap-5">
      <Section label="Auto-zoom">
        <Toggle label="Enabled" checked={enabled} onChange={setEnabled} />
        <p className="text-[11px] leading-relaxed text-muted">
          {keyframes.length} zoom{keyframes.length === 1 ? '' : 's'} planned from the click log.
        </p>
      </Section>

      <Section label={kf ? `Zoom ${selected! + 1}` : 'All zooms'}>
        <Slider
          label="Scale"
          value={scale}
          min={1}
          max={3}
          step={0.05}
          onChange={applyScale}
          format={(v) => `${v.toFixed(2)}×`}
        />
        {kf && (
          <dl className="grid grid-cols-2 gap-y-1 font-mono text-[11px] text-muted">
            <dt>start</dt>
            <dd className="text-right text-fg">{(kf.tStart / 1000).toFixed(2)}s</dd>
            <dt>end</dt>
            <dd className="text-right text-fg">{(kf.tEnd / 1000).toFixed(2)}s</dd>
            <dt>target</dt>
            <dd className="text-right text-fg">
              {kf.targetXNorm.toFixed(2)}, {kf.targetYNorm.toFixed(2)}
            </dd>
          </dl>
        )}
        {!kf && (
          <p className="text-[11px] leading-relaxed text-muted">
            Select a zoom on the timeline to edit it on its own.
          </p>
        )}
      </Section>

      <button
        onClick={onReplan}
        className="rounded-lg bg-raised px-2 py-2 text-fg hover:bg-hover"
      >
        Re-plan from click log
      </button>
    </div>
  );
}
