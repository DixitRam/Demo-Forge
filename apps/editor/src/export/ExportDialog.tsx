import { editedDuration, type CaptionCue, type CutRegion, type ZoomKeyframe } from '@demoforge/core';
import { useEffect, useRef, useState } from 'react';
import { IconExport } from '../panels/icons.js';
import type { LoadedProject } from '../import/loadRecording.js';
import type { FrameStyle } from '../render/style.js';
import { exportMp4 } from './exportMp4.js';
import { serverExport, serverExportAvailable } from './serverExport.js';

const FPS_CHOICES = [24, 30, 60];

interface Props {
  project: LoadedProject;
  keyframes: readonly ZoomKeyframe[];
  captions: readonly CaptionCue[];
  cuts: readonly CutRegion[];
  style: FrameStyle;
  /** Narration mixdown, if one has been generated. */
  narration: Blob | null;
}

export default function ExportDialog({
  project,
  keyframes,
  captions,
  cuts,
  style,
  narration,
}: Props) {
  const [open, setOpen] = useState(false);
  const [fps, setFps] = useState(30);
  const [stage, setStage] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Native ffmpeg on the dev server when it is there; the browser otherwise.
  const [native, setNative] = useState<boolean | null>(null);
  const [engine, setEngine] = useState<'native' | 'browser'>('native');
  useEffect(() => {
    if (open && native === null) void serverExportAvailable().then(setNative);
  }, [open, native]);
  const useNative = native === true && engine === 'native';

  const run = async (): Promise<void> => {
    setError(null);
    setUrl(null);
    abort.current = new AbortController();
    try {
      const opts = {
        rec: project.rec,
        media: project.media,
        narration,
        voice: style.voice,
        keyframes,
        captions,
        cuts,
        style,
        fps,
        signal: abort.current.signal,
        onProgress: (s: string, r: number) => {
          setStage(s);
          setRatio(r);
        },
      };
      const blob = useNative ? await serverExport(opts) : await exportMp4({ ...opts, video: project.video });
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
      abort.current = null;
    }
  };

  const busy = stage !== null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500"
      >
        <IconExport /> Export
      </button>
      {open && (
    <div className="absolute top-10 right-0 z-30 flex w-72 flex-col gap-3 rounded-xl bg-panel p-3 text-xs shadow-xl ring-1 ring-line">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Export MP4</span>
        <span className="text-muted" title="Length after cuts">
          {(editedDuration(cuts, project.rec.video.durationMs) / 1000).toFixed(1)}s
        </span>
      </div>
      <label className="flex items-center justify-between text-muted">
        Frame rate
        <select
          value={fps}
          disabled={busy}
          onChange={(e) => setFps(Number(e.target.value))}
          className="rounded-md bg-raised px-2 py-1 text-fg"
        >
          {FPS_CHOICES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      {native && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-muted">Render with</span>
          <select
            value={engine}
            disabled={busy}
            onChange={(e) => setEngine(e.target.value as 'native' | 'browser')}
            className="rounded-md bg-raised px-2 py-1 text-fg"
          >
            <option value="native">ffmpeg on this machine (fast)</option>
            <option value="browser">the browser (slow)</option>
          </select>
        </label>
      )}

      {busy && (
        <span className="flex items-center gap-2 text-muted">
          <span className="h-1.5 flex-1 overflow-hidden rounded bg-raised">
            <span
              style={{ width: `${ratio * 100}%` }}
              className="block h-full bg-blue-400 transition-[width]"
            />
          </span>
          {stage} {Math.round(ratio * 100)}%
        </span>
      )}

      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}

      {url && (
        <a
          href={url}
          download="demo.mp4"
          className="rounded-lg bg-emerald-600 px-3 py-2 text-center font-medium text-white hover:bg-emerald-500"
        >
          Download demo.mp4
        </a>
      )}

      {busy ? (
        <button
          onClick={() => abort.current?.abort()}
          className="rounded-lg bg-raised px-3 py-2 text-fg hover:bg-hover"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={() => void run()}
          className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500"
        >
          {url ? 'Render again' : 'Render'}
        </button>
      )}
    </div>
      )}
    </div>
  );
}
