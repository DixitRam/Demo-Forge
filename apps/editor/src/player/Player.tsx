import { skipTarget, type CaptionCue, type CutRegion, type ZoomKeyframe } from '@demoforge/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadedProject } from '../import/loadRecording.js';
import { exporting } from '../export/exportMp4.js';
import { compose } from '../render/compose.js';
import { outputAspect, type FrameStyle } from '../render/style.js';

/** Preview resolution; the exporter renders at the video's native size. */
const PREVIEW_WIDTH = 1280;

interface Props {
  project: LoadedProject;
  keyframes: readonly ZoomKeyframe[];
  captions: readonly CaptionCue[];
  cuts: readonly CutRegion[];
  style: FrameStyle;
  onTime: (ms: number) => void;
  /** Rendered over the canvas, stretched to the same box. */
  overlay?: (canvas: { w: number; h: number }) => ReactNode;
}

export default function Player({ project, keyframes, captions, cuts, style, onTime, overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: PREVIEW_WIDTH, h: 720 });

  // The draw loop reads the latest props through a ref so it never restarts.
  const latest = useRef({ keyframes, captions, cuts, style, onTime });
  latest.current = { keyframes, captions, cuts, style, onTime };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { video, rec } = project;

    let frame = 0;
    const draw = (): void => {
      if (exporting) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const cur = latest.current;

      // Playback jumps over cut regions. Done here rather than on 'timeupdate'
      // so the skip lands within a frame instead of the ~250ms that event
      // fires at — otherwise you see a quarter second of removed footage.
      const jump = skipTarget(cur.cuts, rec.video.durationMs, video.currentTime * 1000);
      if (jump !== null) {
        video.currentTime = jump / 1000;
        // A cut running to the end has nowhere to land: stop there.
        if (jump >= rec.video.durationMs && !video.paused) video.pause();
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
