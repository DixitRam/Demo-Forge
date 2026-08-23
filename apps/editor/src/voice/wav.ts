/**
 * 16-bit PCM WAV encoding.
 *
 * The narration is mixed with Web Audio and handed to ffmpeg as one file, and
 * WAV is the one container both ends agree on without a codec. Pure maths over
 * Float32Arrays so it can be tested outside a browser.
 */

export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const ch = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytes = frames * ch * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const view = new DataView(buf);

  const ascii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, ch, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * ch * 2, true); // byte rate
  view.setUint16(32, ch * 2, true); // block align
  view.setUint16(34, 16, true); // bits
  ascii(36, 'data');
  view.setUint32(40, bytes, true);

  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      // Clamp before scaling: a mix of two loud lines can exceed 1.0, and
      // wrapping that around is the difference between loud and destroyed.
      const s = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return new Uint8Array(buf);
}
