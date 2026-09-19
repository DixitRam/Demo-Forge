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
import type { ProviderInfo } from '../voice/tts.js';
import type { WriterStatus } from '../voice/writeScript.js';
import { Section, Slider } from './controls.js';

/** Starting points for a director's note; it is free text, not a menu. */
/** The .env name to set for each hosted provider. */
const KEY_NAMES: Record<string, string> = {
  gemini: 'GEMINI_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
  mistral: 'MISTRAL_API_KEY',
};

const DIRECTIONS: string[] = [
  'A clear, friendly product walkthrough narrator. Measured pace, warm and articulate.',
  'An authoritative corporate trainer. Newscaster style, deliberate pauses.',
  'An enthusiastic founder demoing their own product. Quick, upbeat, conversational.',
];

interface Props {
  rec: DemoRecording;
  script: ScriptLine[];
  setScript: (s: ScriptLine[]) => void;
  brief: string;
  setBrief: (b: string) => void;
  writer: WriterStatus | null;
  writing: string | null;
  writeError: string | null;
  onWrite: () => void;
  style: ProjectStyle;
  setStyle: (s: ProjectStyle) => void;
  selected: number | null;
  onSelect: (i: number | null) => void;
  timeMs: number;
  onSeek: (ms: number) => void;
  providers: ProviderInfo[] | null;
  progress: VoiceProgress | null;
  error: string | null;
  hasNarration: boolean;
  onGenerate: () => void;
}

const stamp = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A metered provider charges per character, so the panel says what a generate
 * will cost before you press it rather than after.
 */
function ProviderQuota({
  quota,
  pending,
}: {
  quota: { used: number; limit: number };
  pending: number;
}) {
  const left = Math.max(0, quota.limit - quota.used);
  const short = pending > left;
  return (
    <div className="flex flex-col gap-1">
      <span className="flex justify-between text-[10px]">
        <span className="text-muted">{left.toLocaleString()} characters left</span>
        {pending > 0 && (
          <span className={short ? 'text-red-700 dark:text-red-400' : 'text-muted'}>
            this run: {pending.toLocaleString()}
          </span>
        )}
      </span>
      <span className="h-1 overflow-hidden rounded bg-raised">
        <span
          style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }}
          className="block h-full bg-blue-400"
        />
      </span>
      {short && (
        <span className="text-[10px] text-red-700 dark:text-red-400">
          Not enough left for the whole script — it will stop partway.
        </span>
      )}
    </div>
  );
}

const SELECT =
  'rounded-lg border border-line bg-panel px-2 py-1.5 text-fg outline-none focus:border-blue-500';

export default function ScriptPanel(p: Props) {
  const duration = p.rec.video.durationMs;
  const v = p.style.voice;
  const setV = (patch: Partial<typeof v>): void =>
    p.setStyle({ ...p.style, voice: { ...v, ...patch } });

  const overruns = new Set(scriptOverruns(p.script, duration, v.rate));
  const unspoken = p.script.filter((l) => l.audioMs === undefined).length;
  const busy = p.progress !== null;

  const provider = p.providers?.find((x) => x.id === v.provider) ?? null;
  const voices = provider?.voices ?? [];
  const current = voices.find((o) => o.id === v.voice);

  return (
    <div className="flex flex-col gap-5">
      <Section label="Voice">
        {p.providers && (
          <div className="flex gap-1 rounded-lg bg-raised p-1">
            {p.providers.map((x) => (
              <button
                key={x.id}
                onClick={() =>
                  setV({
                    provider: x.id,
                    voice:
                      (x.voices.find((o) => o.mood?.toLowerCase() === 'neutral') ?? x.voices[0])?.id ??
                      v.voice,
                  })
                }
                title={x.ok ? x.label : x.error}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] transition ${
                  v.provider === x.id
                    ? 'bg-blue-600 font-medium text-white shadow-sm'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {x.label}
                {!x.ok && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
              </button>
            ))}
          </div>
        )}

        {provider?.quota && (
          <ProviderQuota
            quota={provider.quota}
            pending={p.script
              .filter((l) => l.audioMs === undefined)
              .reduce((n, l) => n + l.text.trim().length, 0)}
          />
        )}
        {provider?.note && <p className="text-[10px] leading-relaxed text-muted">{provider.note}</p>}

        {current?.speaker ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-muted">Voice</span>
              <select
                value={current.speaker}
                onChange={(e) => {
                  // Keep the mood when the new speaker has it, else fall back to neutral.
                  const theirs = voices.filter((o) => o.speaker === e.target.value);
                  const next =
                    theirs.find((o) => o.mood === current.mood) ??
                    theirs.find((o) => o.mood?.toLowerCase() === 'neutral') ??
                    theirs[0];
                  if (next) setV({ voice: next.id });
                }}
                className={SELECT}
              >
                {[...new Set(voices.map((o) => o.speaker))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">Mood</span>
              <select value={v.voice} onChange={(e) => setV({ voice: e.target.value })} className={SELECT}>
                {voices
                  .filter((o) => o.speaker === current.speaker)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.mood ?? 'Default'}
                      {o.hint ? ` — ${o.hint}` : ''}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-muted">Voice</span>
            <select value={v.voice} onChange={(e) => setV({ voice: e.target.value })} className={SELECT}>
              {voices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              {!current && <option value={v.voice}>{v.voice}</option>}
            </select>
          </label>
        )}

        {provider?.rate !== false && (
          <Slider
            label="Speed"
            value={v.rate}
            min={100}
            max={260}
            step={5}
            onChange={(rate) => setV({ rate })}
            format={(x) => `${Math.round(x)} wpm`}
          />
        )}

        {provider?.direction && (
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-muted">
              How to read it
              <select
                value=""
                onChange={(e) => e.target.value && setV({ direction: e.target.value })}
                className="rounded bg-raised px-1 py-0.5 text-[10px] text-fg"
              >
                <option value="">presets…</option>
                {DIRECTIONS.map((d, i) => (
                  <option key={i} value={d}>
                    {d.split('.')[0]}
                  </option>
                ))}
              </select>
            </span>
            <textarea
              value={v.direction}
              rows={3}
              placeholder="Tone, pace, accent — handed to the model with the line."
              onChange={(e) => setV({ direction: e.target.value })}
              className="w-full resize-none rounded-lg border border-line bg-panel p-2 text-[11px] leading-relaxed text-fg outline-none focus:border-blue-500"
            />
          </label>
        )}

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
        <label className="flex flex-col gap-1">
          <span className="text-muted">What is this demo about?</span>
          <textarea
            value={p.brief}
            rows={2}
            placeholder="The product, the audience, what you want them to take away. Optional, but it is the difference between a decent script and a good one."
            onChange={(e) => p.setBrief(e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-panel p-2 text-[11px] leading-relaxed text-fg outline-none focus:border-blue-500"
          />
        </label>

        <button
          onClick={p.onWrite}
          disabled={p.writing !== null || p.writer?.ok === false}
          title="Sends a frame of each step, with the click marked, to a model that writes to the time available"
          className="rounded-lg bg-violet-500/90 py-2 font-medium text-white hover:bg-violet-400 disabled:opacity-40"
        >
          {p.writing ?? '✧ Write the script with AI'}
        </button>
        {p.writer?.ok === false && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            {p.writer.error} It uses the same GEMINI_API_KEY as the voice.
          </p>
        )}
        {p.writeError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">
            {p.writeError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              p.setScript(scriptFromClicks(p.rec));
              p.onSelect(null);
            }}
            title="A rough draft from the element text already in the log — no AI, no network"
            className="flex-1 rounded-lg bg-raised py-2 text-fg hover:bg-hover"
          >
            From clicks
          </button>
          <button
            onClick={() => {
              const next = insertLine(p.script, p.timeMs, duration);
              p.setScript(next);
              p.onSelect(next.findIndex((l) => l.tStart === Math.min(Math.max(0, p.timeMs), duration)));
            }}
            className="flex-1 rounded-lg bg-raised py-2 text-fg hover:bg-hover"
          >
            + At playhead
          </button>
        </div>

        <button
          onClick={p.onGenerate}
          disabled={busy || p.script.length === 0 || provider?.ok === false}
          className="rounded-lg bg-blue-600/90 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {busy
            ? (p.progress!.note ?? `Speaking ${p.progress!.done + 1}/${p.progress!.total}…`)
            : unspoken > 0
              ? `Generate voiceover (${unspoken} new)`
              : 'Regenerate voiceover'}
        </button>

        {p.hasNarration && !busy && (
          <p className="text-[11px] leading-relaxed text-muted">
            Voiceover ready — it plays in the preview and is muxed into the export, with the
            recording ducked underneath.
          </p>
        )}
        {provider?.ok === false && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            {provider.error}{' '}
            {provider.id === 'local'
              ? 'Install it (dnf install espeak-ng) and restart the dev server.'
              : `Put ${KEY_NAMES[provider.id]} in .env at the repo root (or apps/editor/.env) and restart the dev server.`}
          </p>
        )}
        {p.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">
            {p.error}
          </p>
        )}
        {overruns.size > 0 && (
          <button
            onClick={() => p.setScript(spaceOutScript(p.script, v.rate, MIN_LINE_GAP_MS))}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 py-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
          >
            {overruns.size} line{overruns.size > 1 ? 's talk' : ' talks'} over the next — space out
          </button>
        )}
        {p.script.length === 0 && (
          <p className="text-[11px] leading-relaxed text-muted">
            No narration yet. Write it with AI — it looks at a frame of every step — or draft
            something rough “From clicks”. Edit the words, then generate the voiceover.
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
                  ? 'border-blue-500/70 bg-blue-600/5'
                  : 'border-line hover:border-line'
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px]">
                <button
                  onClick={() => p.onSeek(line.tStart)}
                  title="Jump here"
                  className="rounded bg-raised px-1.5 py-0.5 font-mono text-fg hover:bg-hover"
                >
                  {stamp(line.tStart)}
                </button>
                <span className={overruns.has(i) ? 'text-amber-700 dark:text-amber-400' : 'text-faint'}>
                  {(lineDuration(line, v.rate) / 1000).toFixed(1)}s
                  {line.audioMs === undefined && ' est.'}
                </span>
                <button
                  onClick={() => {
                    p.setScript(deleteLine(p.script, i));
                    p.onSelect(null);
                  }}
                  className="ml-auto rounded px-1 text-faint hover:bg-raised hover:text-red-700 dark:hover:text-red-300"
                  title="Delete line"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={line.text}
                rows={Math.min(6, Math.ceil(line.text.length / 34) || 1)}
                onChange={(e) => p.setScript(setLineText(p.script, i, e.target.value))}
                className="w-full resize-none bg-transparent text-[11px] leading-relaxed text-fg outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
