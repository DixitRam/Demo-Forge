/**
 * Speech for the narration script.
 *
 * Every provider lives behind one dev-server endpoint (see vite-tts.ts), which
 * also says which of them can actually speak right now. `speak()` is the whole
 * seam: the mixdown, the timeline and the exporter never learn who spoke.
 */

import type { ScriptLine, VoiceProvider, VoiceStyle } from '@demoforge/core';
import { encodeWav } from './wav.js';

const ENDPOINT = '/api/tts';

export interface VoiceOption {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: VoiceProvider;
  label: string;
  ok: boolean;
  error?: string;
  voices: VoiceOption[];
  /** Takes a words-per-minute number. */
  rate: boolean;
  /** Takes a free-text director's note. */
  direction: boolean;
}

export async function ttsProviders(): Promise<ProviderInfo[]> {
  try {
    const res = await fetch(ENDPOINT);
    const body = (await res.json()) as { providers?: ProviderInfo[] };
    return body.providers ?? [];
  } catch {
    return [];
  }
}

/** A provider asking us to slow down, with how long it wants. */
export class RateLimited extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'RateLimited';
  }
}

/** Raw speech for one line. Throws with the provider's own message. */
export async function speak(text: string, voice: VoiceStyle): Promise<ArrayBuffer> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      provider: voice.provider,
      voice: voice.voice,
      rate: Math.round(voice.rate),
      direction: voice.direction,
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
      retryAfterMs?: number;
    } | null;
    const message = detail?.error ?? `Speech failed (${res.status}).`;
    if (res.status === 429 && detail?.retryAfterMs) {
      throw new RateLimited(message, detail.retryAfterMs);
    }
    throw new Error(message);
  }
  return res.arrayBuffer();
}

/** Identity of a rendering of a line: change any of it and it must be respoken. */
export function lineKey(text: string, voice: VoiceStyle): string {
  return [
    voice.provider,
    voice.voice,
    Math.round(voice.rate),
    voice.direction.trim(),
    text.trim(),
  ].join('|');
}

/**
 * Lay every spoken line onto one track at its source-time anchor.
 *
 * The mixdown is in SOURCE time, not edited time — the same clock as the
 * video element — so the preview can slave it to `video.currentTime` and the
 * exporter can splice it with exactly the cut filter it already applies to the
 * captured audio. Nothing here knows what a cut is.
 */
export async function mixNarration(
  lines: readonly ScriptLine[],
  spoken: ReadonlyMap<string, AudioBuffer>,
  voice: VoiceStyle,
  durationMs: number,
): Promise<Blob | null> {
  const parts = lines
    .map((l) => ({ at: l.tStart, buf: spoken.get(lineKey(l.text, voice)) }))
    .filter((p): p is { at: number; buf: AudioBuffer } => !!p.buf);
  if (parts.length === 0) return null;

  const rate = parts[0]!.buf.sampleRate;
  // Long enough for the demo, and for anything still talking past the end.
  const endMs = Math.max(durationMs, ...parts.map((p) => p.at + p.buf.duration * 1000));
  const frames = Math.max(1, Math.ceil((endMs / 1000) * rate));

  const ctx = new OfflineAudioContext(1, frames, rate);
  const gain = ctx.createGain();
  gain.gain.value = voice.gain;
  gain.connect(ctx.destination);
  for (const p of parts) {
    const src = ctx.createBufferSource();
    src.buffer = p.buf;
    src.connect(gain);
    src.start(Math.max(0, p.at / 1000));
  }

  const mixed = await ctx.startRendering();
  const wav = encodeWav([mixed.getChannelData(0)], mixed.sampleRate);
  return new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' });
}
