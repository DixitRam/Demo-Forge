import { effectiveTrim, type CaptionCue, type Trim, type ZoomKeyframe } from '@demoforge/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import { compose } from '../render/compose.js';
import { outputAspect, type FrameStyle } from '../render/style.js';

/** Preview resolution; the exporter renders at the video's native size. */
const PREVIEW_WIDTH = 1280;

interface Props {
  project: LoadedProject;
  keyframes: readonly ZoomKeyframe[];
  captions: readonly CaptionCue[];
  trim: Trim | null;
  style: FrameStyle;
  onTime: (ms: number) => void;
  /** Rendered over the canvas, stretched to the same box. */
  overlay?: (canvas: { w: number; h: number }) => ReactNode;
}

export default function Player({ project, keyframes, captions, trim, style, onTime, overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: PREVIEW_WIDTH, h: 720 });

  // The draw loop reads the latest props through a ref so it never restarts.
  const latest = useRef({ keyframes, captions, trim, style, onTime });
  latest.current = { keyframes, captions, trim, style, onTime };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { video, rec } = project;

    let frame = 0;
    const draw = (): void => {
      const cur = latest.current;

      // Playback stays inside the kept span. Doing it here rather than on
      // 'timeupdate' means the clamp lands within a frame instead of the
      // ~250ms that event fires at.
      const span = effectiveTrim(cur.trim, rec.video.durationMs);
      if (video.currentTime * 1000 < span.startMs - 1) {
        video.currentTime = span.startMs / 1000;
      } else if (video.currentTime * 1000 >= span.endMs) {
        if (!video.paused) video.pause();
        video.currentTime = span.endMs / 1000;
      }

      const t = video.currentTime * 1000;
      // Aspect can change while playing, so size the canvas in the loop.
      const aspect = outputAspect(cur.style, video.videoWidth, video.videoHeight);
      const h = Math.max(2, Math.round(PREVIEW_WIDTH / aspect));
      if (canvas.width !== PREVIEW_WIDTH || canvas.height !== h) {
        canvas.width = PREVIEW_WIDTH;
        canvas.height = h;
        setSize({ w: PREVIEW_WIDTH, h });
      }
      compose(ctx, canvas.width, canvas.height, {
        video,
        rec,
        keyframes: cur.keyframes,
        captions: cur.captions,
        t,
        style: cur.style,
      });
      cur.onTime(t);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [project]);

  return (
    <div className="relative max-h-full" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      <canvas
        ref={canvasRef}
        className="block max-h-full max-w-full rounded-lg shadow-2xl shadow-black/50"
      />
      {overlay?.(size)}
    </div>
  );
}
