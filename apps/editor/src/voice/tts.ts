/**
 * Speech for the narration script.
 *
 * One provider today — the dev server's espeak-ng endpoint (see vite-tts.ts).
 * `speak()` is the whole seam: point it at a hosted provider and everything
 * above it, including the mixdown and the exporter, is unchanged.
 */

import type { ScriptLine, VoiceStyle } from '@demoforge/core';
import { encodeWav } from './wav.js';

const ENDPOINT = '/api/tts';

export interface ProviderStatus {
  ok: boolean;
  provider?: string;
  error?: string;
}

export async function ttsStatus(): Promise<ProviderStatus> {
  try {
    const res = await fetch(ENDPOINT);
    return (await res.json()) as ProviderStatus;
  } catch {
    return { ok: false, error: 'No speech provider on this server.' };
  }
}

/** Raw speech for one line. Throws with the provider's own message. */
export async function speak(text: string, voice: VoiceStyle): Promise<ArrayBuffer> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: voice.voice, rate: Math.round(voice.rate) }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Speech failed (${res.status}).`);
  }
  return res.arrayBuffer();
}

/** Identity of a rendering of a line: change any of it and it must be respoken. */
export function lineKey(text: string, voice: VoiceStyle): string {
  return `${voice.voice}|${Math.round(voice.rate)}|${text.trim()}`;
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
