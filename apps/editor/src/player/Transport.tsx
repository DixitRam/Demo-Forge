import { useEffect, useState } from 'react';
import { IconEnd, IconPause, IconPlay, IconStart } from '../panels/icons.js';
import { ASPECT_PRESETS, type FrameStyle } from '../render/style.js';

interface Props {
  video: HTMLVideoElement;
  timeMs: number;
  durationMs: number;
}

/** m:ss.d — the tenth matters when you are lining a zoom up to a click. */
export function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * Play, and jump to either end. Scrubbing is the timeline's job, and frame
 * stepping lives on the arrow keys.
 */
export default function Transport({ video, timeMs, durationMs }: Props) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const sync = (): void => setPlaying(!video.paused);
    for (const e of ['play', 'pause', 'ended']) video.addEventListener(e, sync);
    sync();
    return () => {
      for (const e of ['play', 'pause', 'ended']) video.removeEventListener(e, sync);
    };
  }, [video]);

  const seek = (ms: number): void => {
    video.currentTime = Math.min(Math.max(0, ms), durationMs) / 1000;
  };
  const edge = 'flex h-8 w-8 items-center justify-center rounded-full text-fg hover:bg-raised';

  return (
    <div className="flex items-center gap-2 text-xs text-muted tabular-nums">
      <span className="w-12 text-right">{fmt(timeMs)}</span>
      <button onClick={() => seek(0)} title="Start (Home)" className={edge}>
        <IconStart />
      </button>
      <button
        onClick={() => (video.paused ? void video.play() : video.pause())}
        title="Play / pause (Space)"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-panel text-fg shadow-sm ring-1 ring-line hover:bg-raised"
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button onClick={() => seek(durationMs)} title="End (End)" className={edge}>
        <IconEnd />
      </button>
      <span className="w-12">{fmt(durationMs)}</span>
    </div>
  );
}

export function AspectPicker({
  style,
  setStyle,
}: {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}) {
  return (
    <select
      value={style.aspect === null ? 'null' : String(style.aspect)}
      onChange={(e) =>
        setStyle({ ...style, aspect: e.target.value === 'null' ? null : Number(e.target.value) })
      }
      title="Aspect ratio"
      className="rounded-lg bg-transparent px-2 py-1 text-xs font-medium text-fg outline-none hover:bg-raised"
    >
      {ASPECT_PRESETS.map((p) => (
        <option key={p.label} value={p.value === null ? 'null' : String(p.value)}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
