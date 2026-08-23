/**
 * Turning the script into one narration track.
 *
 * Speech is cached by (text, voice, rate) for the session and never saved: a
 * project file holds the words, and the words are what regenerate the audio.
 * Editing a line invalidates only that line.
 */

import {
  RateLimited,
  lineKey,
  mixNarration,
  sliceRange,
  speak,
  ttsProviders,
  type ProviderInfo,
} from './tts.js';
import type { ScriptLine, VoiceStyle } from '@demoforge/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VoiceProgress {
  done: number;
  total: number;
  /** What it is doing instead of speaking, if anything. */
  note?: string;
}

/** Longer than this and waiting it out is worse than telling the user. */
const MAX_WAIT_MS = 90_000;
const MAX_RETRIES = 2;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function useVoice(durationMs: number) {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [progress, setProgress] = useState<VoiceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narration, setNarration] = useState<Blob | null>(null);
  const spoken = useRef(new Map<string, AudioBuffer>());
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => {
    void ttsProviders().then(setProviders);
  }, []);

  const narrationUrl = useMemo(
    () => (narration ? URL.createObjectURL(narration) : null),
    [narration],
  );
  useEffect(() => {
    return () => {
      if (narrationUrl) URL.revokeObjectURL(narrationUrl);
    };
  }, [narrationUrl]);

  /**
   * Speak every line that has changed, then remix. Returns the script with
   * measured lengths filled in — the caller owns the script, we do not.
   */
  const generate = useCallback(
    async (lines: readonly ScriptLine[], voice: VoiceStyle): Promise<ScriptLine[]> => {
      setError(null);
      ctx.current ??= new AudioContext();
      const audio = ctx.current;

      const todo = lines.filter((l) => !spoken.current.has(lineKey(l.text, voice)));
      setProgress({ done: 0, total: todo.length });
      try {
        let done = 0;
        for (const line of todo) {
          const key = lineKey(line.text, voice);
          // A free-tier key is a few requests a minute and a script is a few
          // dozen lines, so a quota knock-back is a pause, not a failure.
          for (let attempt = 0; ; attempt++) {
            try {
              const buf = await audio.decodeAudioData(await speak(line.text, voice));
              spoken.current.set(key, buf);
              break;
            } catch (e) {
              if (
                !(e instanceof RateLimited) ||
                attempt >= MAX_RETRIES ||
                e.retryAfterMs > MAX_WAIT_MS
              ) {
                throw e;
              }
              setProgress({
                done,
                total: todo.length,
                note: `rate limited — waiting ${Math.ceil(e.retryAfterMs / 1000)}s`,
              });
              await wait(e.retryAfterMs + 500);
            }
          }
          setProgress({ done: ++done, total: todo.length });
        }

        const measured = lines.map((l) => {
          const buf = spoken.current.get(lineKey(l.text, voice));
          return buf ? { ...l, audioMs: Math.round(buf.duration * 1000) } : l;
        });
        setNarration(await mixNarration(measured, spoken.current, voice, durationMs));
        return measured;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Speech failed.');
        return [...lines];
      } finally {
        setProgress(null);
      }
    },
    [durationMs],
  );

  /**
   * Take on a mixdown saved with a project, and recover the individual lines
   * out of it.
   *
   * Each line knows where it starts and how long it ran, so the track can be
   * sliced back into per-line audio and put in the cache. That is what makes
   * editing one line of a reloaded project cost one request instead of
   * respeaking the whole script — which matters when the voice is metered.
   *
   * Lines that overlap will slice with a little of their neighbour in them;
   * the panel already flags overlaps as something to fix.
   */
  const adopt = useCallback(
    async (blob: Blob, lines: readonly ScriptLine[], voice: VoiceStyle): Promise<void> => {
      setNarration(blob);
      ctx.current ??= new AudioContext();
      const audio = ctx.current;
      try {
        const whole = await audio.decodeAudioData(await blob.arrayBuffer());
        const rate = whole.sampleRate;
        const channel = whole.getChannelData(0);
        for (const line of lines) {
          const at = sliceRange(line.tStart, line.audioMs, rate, whole.length);
          if (!at) continue;
          const slice = audio.createBuffer(1, at.length, rate);
          slice.copyToChannel(channel.subarray(at.start, at.start + at.length), 0);
          spoken.current.set(lineKey(line.text, voice), slice);
        }
      } catch {
        // The mixdown still plays and still exports; only the per-line reuse
        // is lost, and that costs a regenerate, not correctness.
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setNarration(null);
    setError(null);
  }, []);

  return { providers, progress, error, narration, narrationUrl, generate, adopt, clear };
}
