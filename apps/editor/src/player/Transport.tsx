import { useEffect, useState } from 'react';
import {
  IconEnd,
  IconPause,
  IconPlay,
  IconStart,
  IconStepBack,
  IconStepFwd,
} from '../panels/icons.js';
import { ASPECT_PRESETS, type FrameStyle } from '../render/style.js';

const STEP_MS = 1000 / 30;

interface Props {
  video: HTMLVideoElement;
  timeMs: number;
  durationMs: number;
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}

/** m:ss.d — the tenth matters when you are lining a zoom up to a click. */
export function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function Btn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

export default function Transport({ video, timeMs, durationMs, style, setStyle }: Props) {
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

  return (
    <div className="flex w-full max-w-3xl shrink-0 items-center gap-1.5 rounded-full bg-zinc-950/80 py-1.5 pr-2 pl-1.5 ring-1 ring-white/10">
      <button
        onClick={() => (video.paused ? void video.play() : video.pause())}
        title="Play / pause (Space)"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 hover:bg-zinc-200"
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <Btn onClick={() => seek(0)} title="Start (Home)">
        <IconStart />
      </Btn>
      <Btn onClick={() => seek(timeMs - STEP_MS)} title="Back one frame (←)">
        <IconStepBack />
      </Btn>
      <Btn onClick={() => seek(timeMs + STEP_MS)} title="Forward one frame (→)">
        <IconStepFwd />
      </Btn>
      <Btn onClick={() => seek(durationMs)} title="End (End)">
        <IconEnd />
      </Btn>

      <span className="ml-1 font-mono text-xs whitespace-nowrap text-zinc-300">
        {fmt(timeMs)} <span className="text-zinc-600">/ {fmt(durationMs)}</span>
      </span>

      <input
        type="range"
        min={0}
        max={Math.max(1, durationMs)}
        step={10}
        value={Math.min(timeMs, durationMs)}
        onChange={(e) => seek(Number(e.target.value))}
        className="mx-2 min-w-0 flex-1 accent-blue-500"
      />

      <select
        value={style.aspect === null ? 'null' : String(style.aspect)}
        onChange={(e) =>
          setStyle({ ...style, aspect: e.target.value === 'null' ? null : Number(e.target.value) })
        }
        title="Aspect ratio"
        className="rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-200 outline-none hover:bg-zinc-700"
      >
        {ASPECT_PRESETS.map((p) => (
          <option key={p.label} value={p.value === null ? 'null' : String(p.value)}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
