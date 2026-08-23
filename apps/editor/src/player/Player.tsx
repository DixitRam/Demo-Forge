import type { ZoomKeyframe } from '@demoforge/core';
import { useEffect, useRef } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import { compose } from '../render/compose.js';
import { outputAspect, type FrameStyle } from '../render/style.js';

/** Preview resolution; the exporter renders at the video's native size. */
const PREVIEW_WIDTH = 1280;

interface Props {
  project: LoadedProject;
  keyframes: readonly ZoomKeyframe[];
  style: FrameStyle;
  onTime: (ms: number) => void;
}

export default function Player({ project, keyframes, style, onTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The draw loop reads the latest props through a ref so it never restarts.
  const latest = useRef({ keyframes, style, onTime });
  latest.current = { keyframes, style, onTime };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { video, rec } = project;

    let frame = 0;
    const draw = (): void => {
      const t = video.currentTime * 1000;
      const cur = latest.current;
      // Aspect can change while playing, so size the canvas in the loop.
      const aspect = outputAspect(cur.style, video.videoWidth, video.videoHeight);
      const h = Math.max(2, Math.round(PREVIEW_WIDTH / aspect));
      if (canvas.width !== PREVIEW_WIDTH || canvas.height !== h) {
        canvas.width = PREVIEW_WIDTH;
        canvas.height = h;
      }
      compose(ctx, canvas.width, canvas.height, {
        video,
        rec,
        keyframes: cur.keyframes,
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
    <canvas
      ref={canvasRef}
      className="max-h-full max-w-full rounded-lg shadow-2xl shadow-black/50"
    />
  );
}
