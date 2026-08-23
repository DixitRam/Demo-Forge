/**
 * Plays the narration mixdown alongside the preview.
 *
 * The video element stays the one source of truth for time (it is what the
 * render loop reads), so this follows it rather than driving it: same play and
 * pause, and a nudge back into line whenever it drifts — which is every time
 * the playhead jumps a cut.
 */

import { useEffect, useRef } from 'react';

/** Past this much slip the mixdown is audibly out of step with the picture. */
const MAX_DRIFT_S = 0.12;

interface Props {
  video: HTMLVideoElement;
  url: string | null;
  gain: number;
}

export default function NarrationTrack({ video, url, gain }: Props) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a || !url) return;

    const sync = (): void => {
      if (Math.abs(a.currentTime - video.currentTime) > MAX_DRIFT_S) {
        a.currentTime = video.currentTime;
      }
    };
    const onPlay = (): void => {
      sync();
      void a.play().catch(() => undefined);
    };
    const onPause = (): void => a.pause();

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', sync);
    const tick = setInterval(() => {
      if (!video.paused) sync();
    }, 500);

    if (!video.paused) onPlay();
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', sync);
      clearInterval(tick);
      a.pause();
    };
  }, [video, url]);

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, gain));
  }, [gain]);

  return url ? <audio ref={ref} src={url} preload="auto" /> : null;
}
