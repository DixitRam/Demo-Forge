import { DEFAULT_VOICE } from '@demoforge/core';
import { describe, expect, it } from 'vitest';
import { geminiPrompt, pcmFormat, readableError } from '../vite-tts.js';
import { lineKey } from '../src/voice/tts.js';

describe('pcmFormat', () => {
  it('reads the rate and width Gemini describes', () => {
    expect(pcmFormat('audio/L16;codec=pcm;rate=24000')).toEqual({
      rate: 24_000,
      bits: 16,
      channels: 1,
    });
    expect(pcmFormat('audio/L24;rate=48000').bits).toBe(24);
  });

  it('falls back to 24k/16-bit rather than writing a nonsense header', () => {
    expect(pcmFormat('')).toEqual({ rate: 24_000, bits: 16, channels: 1 });
    expect(pcmFormat('audio/Lxx;rate=nope')).toEqual({ rate: 24_000, bits: 16, channels: 1 });
  });
});

describe('geminiPrompt', () => {
  it('is the bare line when there is no direction', () => {
    expect(geminiPrompt('Click Submit.', '   ')).toBe('Click Submit.');
  });

  it('puts the direction ahead of the words and asks for nothing else', () => {
    const p = geminiPrompt('Click Submit.', 'Warm and unhurried.');
    expect(p.indexOf('Warm and unhurried.')).toBeLessThan(p.indexOf('Click Submit.'));
    expect(p).toMatch(/say nothing else/i);
  });
});

describe('lineKey', () => {
  const base = { ...DEFAULT_VOICE };

  it('separates the same words spoken by different providers', () => {
    expect(lineKey('hello', base)).not.toBe(
      lineKey('hello', { ...base, provider: 'gemini', voice: 'Iapetus' }),
    );
  });

  it('respeaks when the direction changes', () => {
    expect(lineKey('hello', base)).not.toBe(lineKey('hello', { ...base, direction: 'Chirpy.' }));
  });

  it('ignores level changes, which are applied at mixdown', () => {
    expect(lineKey('hello', base)).toBe(lineKey('hello', { ...base, gain: 0.3, duck: 0.9 }));
  });
});

describe('readableError', () => {
  it('digs the sentence out of Google\'s nested error JSON', () => {
    const nested = new Error(
      JSON.stringify({
        error: {
          message: JSON.stringify({
            error: { code: 400, message: 'API key not valid. Please pass a valid API key.' },
          }),
        },
      }),
    );
    expect(readableError(nested)).toBe('API key not valid. Please pass a valid API key.');
  });

  it('leaves a plain message alone', () => {
    expect(readableError(new Error('espeak-ng produced no audio.'))).toBe(
      'espeak-ng produced no audio.',
    );
  });

  it('always says something', () => {
    expect(readableError(new Error('   '))).toBe('Speech failed.');
    expect(readableError(null)).toBe('null');
  });
});
