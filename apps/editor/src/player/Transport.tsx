import { useEffect, useState } from 'react';

interface Props {
  video: HTMLVideoElement;
  timeMs: number;
  durationMs: number;
}

function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}

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

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={() => (video.paused ? void video.play() : video.pause())}
        className="w-20 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-white"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, durationMs)}
        step={10}
        value={Math.min(timeMs, durationMs)}
        onChange={(e) => {
          video.currentTime = Number(e.target.value) / 1000;
        }}
        className="flex-1 accent-sky-400"
      />
      <span className="w-28 text-right font-mono text-xs text-slate-400">
        {fmt(timeMs)} / {fmt(durationMs)}
      </span>
    </div>
  );
}
