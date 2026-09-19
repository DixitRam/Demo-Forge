/**
 * Text-to-speech for the dev server.
 *
 * The editor is a static app with no backend, but a browser cannot spawn a
 * process or hold an API key — so the providers live here, behind one
 * endpoint:
 *
 *   GET  /api/tts   what can speak right now, and with which voices
 *   POST /api/tts   {provider, text, voice, rate, direction} -> audio/wav
 *
 * `local` is espeak-ng on this machine: free, offline, instant, robotic.
 * `gemini` is Google's hosted TTS: needs GEMINI_API_KEY, sounds like a person,
 * and takes a director's note instead of a words-per-minute dial.
 * `elevenlabs` needs ELEVENLABS_API_KEY, has the best voices, and is metered
 * per character — so it reports what is left of the allowance.
 * `mistral` is Voxtral TTS: needs MISTRAL_API_KEY, preset voices plus any the
 * account has cloned.
 *
 * ponytail: dev-server only, so a built editor has no voice provider. Fine
 * while this is a self-hosted tool you run with `pnpm dev`; the fix is the
 * same backend the Phase 2 TODO already calls for.
 */

import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { loadEnv, type Plugin } from 'vite';

const BIN = 'espeak-ng';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';
const ELEVEN_API = 'https://api.elevenlabs.io/v1';
const MISTRAL_API = 'https://api.mistral.ai/v1';
const DEFAULT_MISTRAL_MODEL = 'voxtral-mini-tts-2603';
/** Mistral voice ids are UUIDs or slugs. */
const MISTRAL_VOICE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Multilingual v2 is 1 credit per character. `eleven_flash_v2_5` is half that
 * and noticeably less good — set ELEVENLABS_MODEL if the allowance matters
 * more than the voice.
 */
const DEFAULT_ELEVEN_MODEL = 'eleven_multilingual_v2';
/**
 * 44.1 kHz PCM needs a Pro subscription; 24 kHz is what every tier can ask
 * for, and it is the rate Gemini returns anyway.
 */
const ELEVEN_FORMAT = 'pcm_24000';
/** The free tier refuses anything longer in a single request. */
const ELEVEN_MAX_TEXT = 2500;

/** espeak voice ids and variants: `en-us`, `en-gb+f3`. Nothing else runs. */
const ESPEAK_VOICE_RE = /^[a-z0-9]([a-z0-9_-]*)(\+[a-z0-9_]+)?$/i;
/** Gemini's prebuilt voices are bare names. */
const GEMINI_VOICE_RE = /^[A-Za-z][A-Za-z0-9]{1,31}$/;
/** ElevenLabs voice ids are opaque alphanumerics. */
const ELEVEN_VOICE_RE = /^[A-Za-z0-9]{8,40}$/;
const MAX_TEXT = 2000;
const MAX_BODY = 64 * 1024;

export interface VoiceOption {
  id: string;
  label: string;
}

/** Voices that ship with every espeak-ng install, so the list is never a lie. */
const ESPEAK_VOICES: VoiceOption[] = [
  { id: 'en-us+f3', label: 'US · female' },
  { id: 'en-us+f5', label: 'US · female, softer' },
  { id: 'en-us+m3', label: 'US · male' },
  { id: 'en-us+m7', label: 'US · male, deeper' },
  { id: 'en-gb+f2', label: 'UK · female' },
  { id: 'en-gb-x-rp+m3', label: 'UK · male, RP' },
  { id: 'en-us', label: 'US · default' },
];

const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Iapetus', label: 'Iapetus · clear' },
  { id: 'Charon', label: 'Charon · informative' },
  { id: 'Kore', label: 'Kore · firm' },
  { id: 'Puck', label: 'Puck · upbeat' },
  { id: 'Zephyr', label: 'Zephyr · bright' },
  { id: 'Aoede', label: 'Aoede · breezy' },
  { id: 'Leda', label: 'Leda · youthful' },
  { id: 'Achird', label: 'Achird · friendly' },
  { id: 'Sulafat', label: 'Sulafat · warm' },
  { id: 'Algieba', label: 'Algieba · smooth' },
  { id: 'Erinome', label: 'Erinome · clear' },
  { id: 'Schedar', label: 'Schedar · even' },
];

export interface Quota {
  used: number;
  limit: number;
}

export interface ProviderInfo {
  id: 'local' | 'gemini' | 'elevenlabs' | 'mistral';
  label: string;
  ok: boolean;
  error?: string;
  voices: VoiceOption[];
  /** Whether the provider takes a words-per-minute number. */
  rate: boolean;
  /** Whether it takes a free-text director's note. */
  direction: boolean;
  /** Characters spent against a metered allowance, when the provider says. */
  quota?: Quota;
  /** Conditions attached to using it, shown in the panel. */
  note?: string;
}

// --- shared ----------------------------------------------------------------

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

/** http://soundfile.sapp.org/doc/WaveFormat */
function wavHeader(dataLength: number, channels: number, rate: number, bits: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLength, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE((rate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLength, 40);
  return h;
}

// --- espeak-ng -------------------------------------------------------------

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

function speakLocal(text: string, voice: string, rate: number): Promise<Buffer> {
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

function haveEspeak(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(BIN, ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

// --- gemini ----------------------------------------------------------------

/**
 * Gemini returns raw PCM described by a mime type like
 * `audio/L16;codec=pcm;rate=24000`, so the WAV header is ours to write.
 */
export function pcmFormat(mimeType: string): { rate: number; bits: number; channels: number } {
  const [type, ...params] = mimeType.split(';').map((s) => s.trim());
  const bits = Number.parseInt(type?.split('/')[1]?.replace(/^L/i, '') ?? '', 10);
  const rate = params
    .map((p) => p.split('=').map((x) => x.trim()))
    .find(([k]) => k === 'rate')?.[1];
  return {
    rate: Number.parseInt(rate ?? '', 10) || 24_000,
    bits: Number.isFinite(bits) && bits > 0 ? bits : 16,
    channels: 1,
  };
}

/**
 * The director's note goes in the same prompt as the words — that is how this
 * model is steered. Without one it just reads the line.
 */
export function geminiPrompt(text: string, direction: string): string {
  const note = direction.trim();
  return note ? `${note}\n\nRead this aloud, and say nothing else:\n${text}` : text;
}

async function speakGemini(
  text: string,
  voice: string,
  direction: string,
  apiKey: string,
  model: string,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });

  const stream = await ai.models.generateContentStream({
    model,
    config: {
      responseModalities: ['audio'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
    contents: [{ role: 'user', parts: [{ text: geminiPrompt(text, direction) }] }],
  });

  const chunks: Buffer[] = [];
  let mimeType = '';
  for await (const chunk of stream) {
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData;
      if (!inline?.data) continue;
      mimeType ||= inline.mimeType ?? '';
      chunks.push(Buffer.from(inline.data, 'base64'));
    }
  }

  const pcm = Buffer.concat(chunks);
  if (pcm.length === 0) throw new Error('Gemini returned no audio for that line.');
  // A model that hands back a container already needs no header from us.
  if (/wav/i.test(mimeType)) return pcm;
  const f = pcmFormat(mimeType);
  return Buffer.concat([wavHeader(pcm.length, f.channels, f.rate, f.bits), pcm]);
}

/**
 * Google nests its error JSON inside the SDK's message string, sometimes
 * twice over. Dig out the sentence a person can act on.
 */
export function readableError(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  for (let i = 0; i < 3; i++) {
    let inner: string | undefined;
    try {
      inner = (JSON.parse(msg) as { error?: { message?: string } }).error?.message;
    } catch {
      break;
    }
    if (typeof inner !== 'string') break;
    msg = inner;
  }
  return msg.trim() || 'Speech failed.';
}

// --- elevenlabs -------------------------------------------------------------

/** ElevenLabs puts its message under `detail`, sometimes as a bare string. */
export async function elevenError(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  const message = (detail as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  return `ElevenLabs returned ${res.status}.`;
}

/**
 * The account's own voices, live. No hardcoded ids: a voice list that has
 * drifted is worse than no list, and without a key you cannot call anyway.
 */
async function elevenVoices(apiKey: string): Promise<VoiceOption[]> {
  const res = await fetch(`${ELEVEN_API}/voices`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(await elevenError(res));
  const body = (await res.json()) as {
    voices?: Array<{ voice_id?: string; name?: string; labels?: Record<string, string> }>;
  };
  return (body.voices ?? [])
    .filter((v): v is { voice_id: string; name?: string; labels?: Record<string, string> } =>
      typeof v.voice_id === 'string',
    )
    .map((v) => {
      const traits = Object.values(v.labels ?? {})
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      return { id: v.voice_id, label: traits ? `${v.name ?? v.voice_id} · ${traits}` : (v.name ?? v.voice_id) };
    });
}

/** Characters spent this period. Free tier is 10k, and it goes fast. */
async function elevenQuota(apiKey: string): Promise<Quota | null> {
  const res = await fetch(`${ELEVEN_API}/user/subscription`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) return null;
  const b = (await res.json()) as { character_count?: number; character_limit?: number };
  if (typeof b.character_count !== 'number' || typeof b.character_limit !== 'number') return null;
  return { used: b.character_count, limit: b.character_limit };
}

async function speakEleven(
  text: string,
  voice: string,
  apiKey: string,
  model: string,
): Promise<Buffer> {
  const res = await fetch(
    `${ELEVEN_API}/text-to-speech/${voice}?output_format=${ELEVEN_FORMAT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }),
    },
  );
  if (!res.ok) throw new Error(await elevenError(res));

  const pcm = Buffer.from(await res.arrayBuffer());
  if (pcm.length === 0) throw new Error('ElevenLabs returned no audio for that line.');
  // We asked for headerless PCM at a known rate, so the header is ours.
  return Buffer.concat([wavHeader(pcm.length, 1, 24_000, 16), pcm]);
}

// --- mistral ---------------------------------------------------------------

/** Mistral errors come as `{message}`, `{detail}`, or FastAPI's `{detail: [{msg}]}`. */
export async function mistralError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
    detail?: unknown;
  } | null;
  if (typeof body?.message === 'string') return body.message;
  if (typeof body?.detail === 'string') return body.detail;
  const first = Array.isArray(body?.detail) ? (body.detail[0] as { msg?: unknown }) : undefined;
  if (typeof first?.msg === 'string') return first.msg;
  return `Mistral returned ${res.status}.`;
}

/** Presets and the account's cloned voices, live — same reasoning as ElevenLabs. */
async function mistralVoices(apiKey: string): Promise<VoiceOption[]> {
  const res = await fetch(`${MISTRAL_API}/audio/voices?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(await mistralError(res));
  const body = (await res.json()) as {
    items?: Array<{ id?: string; name?: string; languages?: string[]; gender?: string | null }>;
  };
  return (body.items ?? [])
    .filter((v): v is { id: string; name?: string; languages?: string[]; gender?: string | null } =>
      typeof v.id === 'string' && MISTRAL_VOICE_RE.test(v.id),
    )
    .map((v) => {
      const traits = [v.gender, v.languages?.slice(0, 3).join('/')].filter(Boolean).join(', ');
      const name = v.name ?? v.id;
      return { id: v.id, label: traits ? `${name} · ${traits}` : name };
    });
}

async function speakMistral(
  text: string,
  voice: string,
  apiKey: string,
  model: string,
): Promise<Buffer> {
  const res = await fetch(`${MISTRAL_API}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text, voice_id: voice, response_format: 'wav' }),
  });
  if (!res.ok) throw new Error(await mistralError(res));

  const body = (await res.json()) as { audio_data?: unknown };
  if (typeof body.audio_data !== 'string' || body.audio_data === '') {
    throw new Error('Mistral returned no audio for that line.');
  }
  const wav = Buffer.from(body.audio_data, 'base64');
  if (wav.toString('latin1', 0, 4) !== 'RIFF') throw new Error('Mistral did not return a WAV file.');
  // A streamed WAV can carry placeholder sizes; patching is a no-op otherwise.
  return fixWavLengths(wav);
}

async function mistralProvider(apiKey: string): Promise<ProviderInfo> {
  const base: ProviderInfo = {
    id: 'mistral',
    label: 'Mistral',
    ok: false,
    voices: [],
    rate: false,
    direction: false,
  };
  if (!apiKey) return { ...base, error: 'MISTRAL_API_KEY is not set for the dev server.' };
  try {
    const voices = await mistralVoices(apiKey);
    if (voices.length === 0) return { ...base, error: 'This Mistral account lists no voices.' };
    return { ...base, ok: true, voices };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'Mistral is unreachable.' };
  }
}

/**
 * A quota error carries the wait in its own text ("Please retry in 32.6s").
 * Handing that number back turns a dead end into a pause — a free-tier key is
 * a few requests a minute, and a script is a few dozen lines.
 */
export function retryAfterMs(message: string): number | null {
  const m = /retry in ([\d.]+)\s*s/i.exec(message);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

// --- endpoint --------------------------------------------------------------

/**
 * A hosted provider is "available" when its key is set AND the key works —
 * for ElevenLabs we find that out by listing voices, which we need anyway.
 */
async function elevenProvider(apiKey: string): Promise<ProviderInfo> {
  const base: ProviderInfo = {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    ok: false,
    voices: [],
    rate: false,
    direction: false,
    note: 'Free tier: 10,000 characters a month, personal use, credit ElevenLabs.',
  };
  if (!apiKey) return { ...base, error: 'ELEVENLABS_API_KEY is not set for the dev server.' };

  try {
    const [voices, quota] = await Promise.all([elevenVoices(apiKey), elevenQuota(apiKey)]);
    return { ...base, ok: true, voices, ...(quota ? { quota } : {}) };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'ElevenLabs is unreachable.' };
  }
}

async function providers(env: Record<string, string>): Promise<ProviderInfo[]> {
  const espeak = await haveEspeak();
  const geminiKey = env.GEMINI_API_KEY ?? '';
  return [
    {
      id: 'local',
      label: 'Local',
      ok: espeak,
      ...(espeak ? {} : { error: 'espeak-ng is not installed on this machine.' }),
      voices: ESPEAK_VOICES,
      rate: true,
      direction: false,
    },
    {
      id: 'gemini',
      label: 'Gemini',
      ok: geminiKey !== '',
      ...(geminiKey ? {} : { error: 'GEMINI_API_KEY is not set for the dev server.' }),
      voices: GEMINI_VOICES,
      rate: false,
      direction: true,
    },
    ...(await Promise.all([
      elevenProvider(env.ELEVENLABS_API_KEY ?? ''),
      mistralProvider(env.MISTRAL_API_KEY ?? ''),
    ])),
  ];
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
): Promise<void> {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    // No key ever leaves the server — only whether there is one that works.
    res.end(JSON.stringify({ providers: await providers(env) }));
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
    const voice = typeof body.voice === 'string' ? body.voice : '';
    const direction = typeof body.direction === 'string' ? body.direction.slice(0, 600) : '';
    const provider =
      body.provider === 'gemini' || body.provider === 'elevenlabs' || body.provider === 'mistral'
        ? body.provider
        : 'local';

    if (!text) return fail(400, 'Nothing to say.');
    if (text.length > MAX_TEXT) return fail(400, `Line is longer than ${MAX_TEXT} characters.`);

    let wav: Buffer;
    if (provider === 'mistral') {
      const key = env.MISTRAL_API_KEY ?? '';
      if (!key) return fail(503, 'MISTRAL_API_KEY is not set for the dev server.');
      if (!MISTRAL_VOICE_RE.test(voice)) return fail(400, `Not a Mistral voice id: ${voice}`);
      wav = await speakMistral(text, voice, key, env.MISTRAL_TTS_MODEL || DEFAULT_MISTRAL_MODEL);
    } else if (provider === 'elevenlabs') {
      const key = env.ELEVENLABS_API_KEY ?? '';
      if (!key) return fail(503, 'ELEVENLABS_API_KEY is not set for the dev server.');
      if (!ELEVEN_VOICE_RE.test(voice)) return fail(400, `Not an ElevenLabs voice id: ${voice}`);
      if (text.length > ELEVEN_MAX_TEXT) {
        return fail(400, `ElevenLabs takes at most ${ELEVEN_MAX_TEXT} characters per line.`);
      }
      wav = await speakEleven(text, voice, key, env.ELEVENLABS_MODEL || DEFAULT_ELEVEN_MODEL);
    } else if (provider === 'gemini') {
      const key = env.GEMINI_API_KEY ?? '';
      if (!key) return fail(503, 'GEMINI_API_KEY is not set for the dev server.');
      if (!GEMINI_VOICE_RE.test(voice)) return fail(400, `Not a Gemini voice: ${voice}`);
      wav = await speakGemini(text, voice, direction, key, env.GEMINI_TTS_MODEL || DEFAULT_GEMINI_MODEL);
    } else {
      const rate = Math.round(Number(body.rate));
      if (!ESPEAK_VOICE_RE.test(voice)) return fail(400, `Not a voice id: ${voice}`);
      if (!Number.isFinite(rate) || rate < 60 || rate > 450) return fail(400, 'Rate out of range.');
      wav = await speakLocal(text, voice, rate);
    }

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    // The page is cross-origin isolated for ffmpeg.wasm; same-origin fetches
    // still need this or the response is blocked.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.end(wav);
  } catch (e) {
    const message = readableError(e);
    const wait = retryAfterMs(message);
    if (wait === null) return fail(500, message);
    res.statusCode = 429;
    res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message, retryAfterMs: wait }));
  }
}

export function ttsPlugin(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: 'demoforge-tts',
    configResolved(config) {
      // Vite's env dir is this app, but in a monorepo the obvious place to put
      // a key is the repo root — so read both, with the app's own file
      // winning. '' loads every variable, not just VITE_ ones: this runs on
      // the server and the key must never be handed to the client.
      const app = config.envDir ?? config.root;
      const repo = resolve(config.root, '..', '..');
      env = { ...loadEnv(config.mode, repo, ''), ...loadEnv(config.mode, app, '') };
    },
    configureServer(server) {
      server.middlewares.use('/api/tts', (req, res) => void handle(req, res, env));
    },
  };
}
