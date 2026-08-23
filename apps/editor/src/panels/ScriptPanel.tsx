import {
  MIN_LINE_GAP_MS,
  lineDuration,
  scriptFromClicks,
  scriptOverruns,
  type DemoRecording,
  type ProjectStyle,
  type ScriptLine,
} from '@demoforge/core';
import {
  deleteLine,
  insertLine,
  setLineText,
  spaceOutScript,
} from '../timeline/scriptOps.js';
import type { VoiceProgress } from '../voice/useVoice.js';
import type { ProviderStatus } from '../voice/tts.js';
import { Section, Slider } from './controls.js';

/**
 * Voices that ship with every espeak-ng install, so the list is never a lie.
 * A hosted provider would fill this from its own catalogue.
 */
const VOICES: Array<{ id: string; label: string }> = [
  { id: 'en-us+f3', label: 'US · female' },
  { id: 'en-us+f5', label: 'US · female, softer' },
  { id: 'en-us+m3', label: 'US · male' },
  { id: 'en-us+m7', label: 'US · male, deeper' },
  { id: 'en-gb+f2', label: 'UK · female' },
  { id: 'en-gb-x-rp+m3', label: 'UK · male, RP' },
  { id: 'en-us', label: 'US · default' },
];

interface Props {
  rec: DemoRecording;
  script: ScriptLine[];
  setScript: (s: ScriptLine[]) => void;
  style: ProjectStyle;
  setStyle: (s: ProjectStyle) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
  timeMs: number;
  onSeek: (ms: number) => void;
  status: ProviderStatus | null;
  progress: VoiceProgress | null;
  error: string | null;
  hasNarration: boolean;
  onGenerate: () => void;
}

const stamp = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function ScriptPanel(p: Props) {
  const duration = p.rec.video.durationMs;
  const v = p.style.voice;
  const setV = (patch: Partial<typeof v>): void =>
    p.setStyle({ ...p.style, voice: { ...v, ...patch } });

  const overruns = new Set(scriptOverruns(p.script, duration, v.rate));
  const unspoken = p.script.filter((l) => l.audioMs === undefined).length;
  const busy = p.progress !== null;

  return (
    <div className="flex flex-col gap-5">
      <Section label="Voice">
        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Voice</span>
          <select
            value={v.voice}
            onChange={(e) => setV({ voice: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500"
          >
            {VOICES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            {!VOICES.some((o) => o.id === v.voice) && <option value={v.voice}>{v.voice}</option>}
          </select>
        </label>
        <Slider
          label="Speed"
          value={v.rate}
          min={100}
          max={260}
          step={5}
          onChange={(rate) => setV({ rate })}
          format={(x) => `${Math.round(x)} wpm`}
        />
        <Slider
          label="Narration level"
          value={v.gain}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(gain) => setV({ gain })}
          format={(x) => `${Math.round(x * 100)}%`}
        />
        <Slider
          label="Recording under voice"
          value={v.duck}
          min={0}
          max={1}
          step={0.05}
          onChange={(duck) => setV({ duck })}
          format={(x) => `${Math.round(x * 100)}%`}
        />
      </Section>

      <Section label="Script">
        <div className="flex gap-2">
          <button
            onClick={() => {
              p.setScript(scriptFromClicks(p.rec));
              p.onSelect(null);
            }}
            title="A draft from the element text already in the click log — no AI"
            className="flex-1 rounded-lg bg-slate-800 py-2 text-slate-200 hover:bg-slate-700"
          >
            From clicks
          </button>
          <button
            onClick={() => {
              const next = insertLine(p.script, p.timeMs, duration);
              p.setScript(next);
              p.onSelect(next.findIndex((l) => l.tStart === Math.min(Math.max(0, p.timeMs), duration)));
            }}
            className="flex-1 rounded-lg bg-slate-800 py-2 text-slate-200 hover:bg-slate-700"
          >
            + At playhead
          </button>
        </div>

        <button
          onClick={p.onGenerate}
          disabled={busy || p.script.length === 0 || p.status?.ok === false}
          className="rounded-lg bg-sky-500/90 py-2 font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-40"
        >
          {busy
            ? `Speaking ${p.progress!.done + 1}/${p.progress!.total}…`
            : unspoken > 0
              ? `Generate voiceover (${unspoken} new)`
              : 'Regenerate voiceover'}
        </button>

        {p.hasNarration && !busy && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            Voiceover ready — it plays in the preview and is muxed into the export, with the
            recording ducked underneath.
          </p>
        )}
        {p.status?.ok === false && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-300">
            {p.status.error} Install it (<code>dnf install espeak-ng</code>) and restart the dev
            server.
          </p>
        )}
        {p.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
            {p.error}
          </p>
        )}
        {overruns.size > 0 && (
          <button
            onClick={() => p.setScript(spaceOutScript(p.script, v.rate, MIN_LINE_GAP_MS))}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 py-1.5 text-amber-300 hover:bg-amber-500/20"
          >
            {overruns.size} line{overruns.size > 1 ? 's talk' : ' talks'} over the next — space out
          </button>
        )}
        {p.script.length === 0 && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            No narration yet. “From clicks” drafts a line per step from the log; edit the words,
            then generate the voiceover.
          </p>
        )}
      </Section>

      {p.script.length > 0 && (
        <div className="flex flex-col gap-2">
          {p.script.map((line, i) => (
            <div
              key={i}
              onPointerDown={() => p.onSelect(i)}
              className={`rounded-lg border p-2 transition ${
                p.selected === i
                  ? 'border-sky-500/70 bg-sky-500/5'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px]">
                <button
                  onClick={() => p.onSeek(line.tStart)}
                  title="Jump here"
                  className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 hover:bg-slate-700"
                >
                  {stamp(line.tStart)}
                </button>
                <span className={overruns.has(i) ? 'text-amber-400' : 'text-slate-600'}>
                  {(lineDuration(line, v.rate) / 1000).toFixed(1)}s
                  {line.audioMs === undefined && ' est.'}
                </span>
                <button
                  onClick={() => {
                    p.setScript(deleteLine(p.script, i));
                    p.onSelect(null);
                  }}
                  className="ml-auto rounded px-1 text-slate-600 hover:bg-slate-800 hover:text-red-300"
                  title="Delete line"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={line.text}
                rows={Math.min(6, Math.ceil(line.text.length / 34) || 1)}
                onChange={(e) => p.setScript(setLineText(p.script, i, e.target.value))}
                className="w-full resize-none bg-transparent text-[11px] leading-relaxed text-slate-200 outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
