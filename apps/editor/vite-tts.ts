/**
 * Local text-to-speech for the dev server.
 *
 * The editor is a static app with no backend, but a browser cannot spawn a
 * process — so the free provider lives here, in the Vite dev server, as one
 * endpoint that shells out to espeak-ng. It is a stand-in: robotic, instant,
 * offline, zero dependencies. Swapping in ElevenLabs later means replacing
 * what answers POST /api/tts, and nothing in the editor changes.
 *
 * ponytail: dev-server only, so a built editor has no voice provider. Fine
 * while this is a self-hosted tool you run with `pnpm dev`; the fix is the
 * same backend the Phase 2 TODO already calls for.
 */

import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const BIN = 'espeak-ng';
/** espeak voice ids and variants: `en-us`, `en-gb+f3`. Nothing else runs. */
const VOICE_RE = /^[a-z0-9]([a-z0-9_-]*)(\+[a-z0-9_]+)?$/i;
const MAX_TEXT = 2000;
const MAX_BODY = 64 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > MAX_BODY) reject(new Error('Body too large.'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * espeak-ng writing to a pipe cannot seek back to fill in the RIFF sizes, so
 * it leaves 0x7FFFFFDC there. ffmpeg shrugs; a browser decoder should not
 * have to. Patch the two lengths now that the whole thing is in hand.
 */
function fixWavLengths(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString('latin1', 0, 4) !== 'RIFF') return wav;
  const data = wav.indexOf('data', 12, 'latin1');
  if (data < 0) return wav;
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.writeUInt32LE(wav.length - (data + 8), data + 4);
  return wav;
}

function speak(text: string, voice: string, rate: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Args as an array, never a shell string: the text is user input.
    const p = spawn(BIN, ['-v', voice, '-s', String(rate), '--stdout'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (c: Buffer) => out.push(c));
    p.stderr.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', (e) =>
      reject(new Error(`${BIN} could not be started (${e.message}). Install espeak-ng.`)),
    );
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `${BIN} exited with ${String(code)}`));
      const wav = Buffer.concat(out);
      if (wav.length < 45) return reject(new Error('espeak-ng produced no audio.'));
      resolve(fixWavLengths(wav));
    });
    p.stdin.end(text, 'utf8');
  });
}

function probe(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(BIN, ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    const ok = await probe();
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        ok
          ? { ok: true, provider: 'espeak-ng' }
          : { ok: false, error: 'espeak-ng is not installed on this machine.' },
      ),
    );
    return;
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }

  const fail = (code: number, error: string): void => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error }));
  };

  try {
    const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const voice = typeof body.voice === 'string' ? body.voice : 'en-us';
    const rate = Math.round(Number(body.rate));

    if (!text) return fail(400, 'Nothing to say.');
    if (text.length > MAX_TEXT) return fail(400, `Line is longer than ${MAX_TEXT} characters.`);
    if (!VOICE_RE.test(voice)) return fail(400, `Not a voice id: ${voice}`);
    if (!Number.isFinite(rate) || rate < 60 || rate > 450) return fail(400, 'Rate out of range.');

    const wav = await speak(text, voice, rate);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    // The page is cross-origin isolated for ffmpeg.wasm; same-origin fetches
    // still need this or the response is blocked.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.end(wav);
  } catch (e) {
    fail(500, e instanceof Error ? e.message : 'Speech failed.');
  }
}

export function ttsPlugin(): Plugin {
  return {
    name: 'demoforge-tts',
    configureServer(server) {
      server.middlewares.use('/api/tts', (req, res) => void handle(req, res));
    },
  };
}
