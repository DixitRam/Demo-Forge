import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/voice/wav.js';
import { sliceRange } from '../src/voice/tts.js';

const read = (b: Uint8Array, at: number): number =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true);
const ascii = (b: Uint8Array, at: number, n: number): string =>
  String.fromCharCode(...b.slice(at, at + n));

describe('encodeWav', () => {
  const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 1])], 48_000);

  it('writes a header whose lengths match the data', () => {
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(wav.length).toBe(44 + 4 * 2);
    expect(read(wav, 4)).toBe(wav.length - 8);
    expect(read(wav, 40)).toBe(wav.length - 44);
    expect(read(wav, 24)).toBe(48_000);
  });

  it('clamps instead of wrapping a mix that went over full scale', () => {
    const hot = encodeWav([new Float32Array([2, -2])], 8000);
    const view = new DataView(hot.buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('interleaves stereo frames', () => {
    const st = encodeWav([new Float32Array([1, 0]), new Float32Array([0, -1])], 8000);
    const view = new DataView(st.buffer);
    expect(st.length).toBe(44 + 2 * 2 * 2);
    expect(view.getInt16(44, true)).toBe(32767); // L0
    expect(view.getInt16(46, true)).toBe(0); // R0
    expect(view.getInt16(48, true)).toBe(0); // L1
    expect(view.getInt16(50, true)).toBe(-32768); // R1
  });
});

describe('sliceRange', () => {
  const RATE = 24_000;
  const TOTAL = 10 * RATE; // a ten second mixdown

  it('finds a line by its anchor and measured length', () => {
    expect(sliceRange(2000, 1500, RATE, TOTAL)).toEqual({ start: 48_000, length: 36_000 });
  });

  it('skips a line that was never spoken', () => {
    expect(sliceRange(2000, undefined, RATE, TOTAL)).toBeNull();
    expect(sliceRange(2000, 0, RATE, TOTAL)).toBeNull();
  });

  it('skips a line anchored past the end of the track', () => {
    expect(sliceRange(11_000, 500, RATE, TOTAL)).toBeNull();
    expect(sliceRange(-100, 500, RATE, TOTAL)).toBeNull();
  });

  it('truncates the last line rather than reading past the end', () => {
    // A mixdown stops when the talking stops, so the final slice is short.
    expect(sliceRange(9500, 1000, RATE, TOTAL)).toEqual({ start: 228_000, length: 12_000 });
  });
});
