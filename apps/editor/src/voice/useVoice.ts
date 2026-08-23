/**
 * Turning the script into one narration track.
 *
 * Speech is cached by (text, voice, rate) for the session and never saved: a
 * project file holds the words, and the words are what regenerate the audio.
 * Editing a line invalidates only that line.
 */

import { lineKey, mixNarration, speak, ttsProviders, type ProviderInfo } from './tts.js';
import type { ScriptLine, VoiceStyle } from '@demoforge/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VoiceProgress {
  done: number;
  total: number;
}

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
          const buf = await audio.decodeAudioData(await speak(line.text, voice));
          spoken.current.set(key, buf);
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

  const clear = useCallback(() => {
    setNarration(null);
    setError(null);
  }, []);

  return { providers, progress, error, narration, narrationUrl, generate, clear };
}
