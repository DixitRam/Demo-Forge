import type { CaptionCue, DemoRecording, ProjectStyle } from '@demoforge/core';
import {
  captionSlotAt,
  captionsFromClicks,
  insertCaption,
  setCaptionText,
} from '../timeline/captionOps.js';
import { Section, Slider } from './controls.js';

interface Props {
  rec: DemoRecording;
  captions: CaptionCue[];
  setCaptions: (c: CaptionCue[]) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
  timeMs: number;
  style: ProjectStyle;
  setStyle: (s: ProjectStyle) => void;
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export default function CaptionsPanel({
  rec,
  captions,
  setCaptions,
  selected,
  onSelect,
  timeMs,
  style,
  setStyle,
}: Props) {
  const duration = rec.video.durationMs;
  const cue = selected === null ? null : captions[selected];
  const cs = style.captions;
  const setCs = (patch: Partial<typeof cs>): void =>
    setStyle({ ...style, captions: { ...cs, ...patch } });

  const add = (): void => {
    const next = insertCaption(captions, timeMs, duration);
    if (next.length === captions.length) return;
    setCaptions(next);
    onSelect(next.findIndex((c) => timeMs >= c.tStart && timeMs < c.tEnd));
  };

  return (
    <div className="flex flex-col gap-5">
      <Section label="Captions">
        <div className="flex gap-2">
          <button
            onClick={add}
            disabled={captionSlotAt(captions, timeMs, duration) === null}
            className="flex-1 rounded-lg bg-slate-800 py-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            + At playhead
          </button>
          <button
            onClick={() => {
              setCaptions(captionsFromClicks(rec));
              onSelect(null);
            }}
            title="One cue per click, using the element text the extension recorded"
            className="flex-1 rounded-lg bg-slate-800 py-2 text-slate-200 hover:bg-slate-700"
          >
            From clicks
          </button>
        </div>

        {captions.length === 0 && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            No captions yet. “From clicks” drafts one per click from the element text already in
            the log — no AI involved.
          </p>
        )}
      </Section>

      {cue && selected !== null && (
        <Section label={`Caption ${selected + 1} · ${secs(cue.tStart)}–${secs(cue.tEnd)}`}>
          <textarea
            value={cue.text}
            rows={3}
            onChange={(e) => setCaptions(setCaptionText(captions, selected, e.target.value))}
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-100 outline-none focus:border-sky-500"
          />
          <button
            onClick={() => {
              setCaptions(captions.filter((_, i) => i !== selected));
              onSelect(null);
            }}
            className="rounded-lg border border-red-500/40 bg-red-500/10 py-1.5 text-red-300 hover:bg-red-500/20"
          >
            Delete caption
          </button>
        </Section>
      )}

      {captions.length > 0 && (
        <Section label="Style">
          <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
            {(['top', 'bottom'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setCs({ position: p })}
                className={`flex-1 rounded-md py-1 capitalize ${
                  cs.position === p
                    ? 'bg-emerald-500/90 font-medium text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Slider
            label="Size"
            value={cs.size}
            min={0.02}
            max={0.12}
            step={0.005}
            onChange={(size) => setCs({ size })}
            format={(v) => `${Math.round(v * 1000) / 10}%`}
          />
          <label className="flex items-center justify-between">
            <span className="text-slate-400">Text colour</span>
            <input
              type="color"
              value={cs.color}
              onChange={(e) => setCs({ color: e.target.value })}
              className="h-7 w-12 rounded border border-slate-700 bg-transparent"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-slate-400">Plate behind text</span>
            <input
              type="checkbox"
              checked={cs.background !== ''}
              onChange={(e) => setCs({ background: e.target.checked ? 'rgba(2,6,23,0.72)' : '' })}
              className="accent-sky-400"
            />
          </label>
        </Section>
      )}
    </div>
  );
}
