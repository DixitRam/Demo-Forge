import { editedDuration, type CaptionCue, type CutRegion, type ZoomKeyframe } from '@demoforge/core';
import { useRef, useState } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import type { FrameStyle } from '../render/style.js';
import { exportMp4 } from './exportMp4.js';

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

  const run = async (): Promise<void> => {
    setError(null);
    setUrl(null);
    abort.current = new AbortController();
    try {
      const blob = await exportMp4({
        rec: project.rec,
        video: project.video,
        media: project.media,
        narration,
        voice: style.voice,
        keyframes,
        captions,
        cuts,
        style,
        fps,
        signal: abort.current.signal,
        onProgress: (s, r) => {
          setStage(s);
          setRatio(r);
        },
      });
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
      abort.current = null;
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-400"
      >
        Export MP4
      </button>
    );
  }

  const busy = stage !== null;

  return (
    <div className="ml-auto flex items-center gap-3 text-xs">
      <span className="text-zinc-500" title="Length after cuts">
        {(editedDuration(cuts, project.rec.video.durationMs) / 1000).toFixed(1)}s
      </span>
      <label className="flex items-center gap-1 text-zinc-400">
        fps
        <select
          value={fps}
          disabled={busy}
          onChange={(e) => setFps(Number(e.target.value))}
          className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200"
        >
          {FPS_CHOICES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      {busy && (
        <span className="flex items-center gap-2 text-zinc-400">
          <span className="h-1.5 w-32 overflow-hidden rounded bg-zinc-800">
            <span
              style={{ width: `${ratio * 100}%` }}
              className="block h-full bg-blue-400 transition-[width]"
            />
          </span>
          {stage} {Math.round(ratio * 100)}%
        </span>
      )}

      {error && <span className="max-w-64 truncate text-red-400">{error}</span>}

      {url && (
        <a
          href={url}
          download="demo.mp4"
          className="rounded-lg bg-blue-500 px-3 py-1.5 font-medium text-white hover:bg-blue-400"
        >
          Download demo.mp4
        </a>
      )}

      {busy ? (
        <button
          onClick={() => abort.current?.abort()}
          className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 hover:bg-zinc-700"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={() => void run()}
          className="rounded bg-blue-500 px-3 py-1 font-medium text-white hover:bg-blue-400"
        >
          {url ? 'Render again' : 'Render'}
        </button>
      )}
    </div>
  );
}
