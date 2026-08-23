/**
 * The script writer: POST /api/script.
 *
 * The editor sends the demo broken into steps — what was clicked, when, how
 * long there is to talk, and a frame of the screen at that moment with the
 * click marked — and a model sends back a line for each. It is the one place
 * that knows what is actually on screen, which is why the words it writes
 * beat any amount of templating over `el.text`.
 *
 * Two things it is deliberately NOT trusted with:
 *   - Timestamps. It says which STEP a line belongs to; the editor decides
 *     when that lands. A model asked for milliseconds returns plausible ones,
 *     and plausible is not synchronised.
 *   - Length. Each step carries a word budget from its window, and the reply
 *     is trimmed to it, because narration that overruns the next step is the
 *     one failure that ruins a demo.
 *
 * ponytail: dev-server only, same as the voice providers, same upgrade path.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';

/** An alias, so this tracks Google's current flash model instead of pinning. */
const DEFAULT_MODEL = 'gemini-flash-latest';
/** Frames dominate the payload; a long demo sends text for the rest. */
const MAX_FRAMES = 24;
const MAX_BODY = 32 * 1024 * 1024;

interface StepIn {
  index: number;
  tMs: number;
  windowMs: number;
  maxWords: number;
  action: string;
  tag?: string;
  text?: string;
  /** Base64 JPEG of the screen at that moment, click marked. Optional. */
  frame?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve_, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) return reject(new Error('Body too large.'));
      parts.push(c);
    });
    req.on('end', () => resolve_(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

const SYSTEM = `You write the voiceover for short product demo videos.

You are given a demo broken into numbered steps. For each step you get when it
happens, how many seconds there are before the next step, a word budget for
that window, what the user clicked, and usually a frame of the screen at that
moment with a magenta ring around the click.

Write the narration a competent product person would say over this recording.

Rules:
- One line per step, at most. Skip a step entirely if there is nothing worth
  saying — silence is better than filler.
- NEVER exceed a step's word budget. It is the number of words that physically
  fit before the next thing happens. Short is always safe.
- Read the screen. Name what is actually visible — the real field, panel and
  button names, the data on show. That is the whole reason you get frames.
- Say why, not what. "Now we filter to the last 24 hours" beats "click the
  dropdown". The viewer can see the click; they cannot see the intent.
- Step 0 is the opening. Say what this thing is and what the viewer is about
  to see, in one sentence.
- Use the last step for a closing line if there is room for one.
- Plain spoken English. No markdown, no stage directions, no emoji, no
  "in this video". Expand symbols and abbreviations into what a person would
  say aloud.
- Do not invent features, numbers or names that are not on screen.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['step', 'text'],
      },
    },
  },
  required: ['lines'],
} as const;

/**
 * Frames are the expensive part, so a long demo keeps an evenly spread subset
 * and the rest go as text. Losing every other picture is far better than
 * losing the second half of the demo.
 */
export function thinFrames<T extends { frame?: string }>(steps: T[], max = MAX_FRAMES): T[] {
  const withFrames = steps.filter((s) => s.frame);
  if (withFrames.length <= max) return steps;
  const keep = new Set<T>();
  for (let i = 0; i < max; i++) {
    keep.add(withFrames[Math.round((i * (withFrames.length - 1)) / (max - 1))]!);
  }
  return steps.map((s) => (!s.frame || keep.has(s) ? s : { ...s, frame: undefined }));
}

/** What the model is told about one step, frames aside. */
export function describeStep(s: StepIn): string {
  const seconds = (s.windowMs / 1000).toFixed(1);
  const what =
    s.action === 'open'
      ? 'the opening frame, before anything happens'
      : `${s.action}${s.tag ? ` on a <${s.tag}>` : ''}${s.text ? ` labelled "${s.text}"` : ''}`;
  return (
    `Step ${s.index} — at ${(s.tMs / 1000).toFixed(1)}s: ${what}. ` +
    `You have ${seconds}s before the next step: at most ${s.maxWords} words.`
  );
}

/**
 * Bring an over-long line back within budget — but only at a sentence end.
 *
 * Chopping at the word count is how you get "AirSense monitors air quality
 * readings for." A line that runs a little long still reads; a truncated one
 * does not, and the panel already flags and spaces overruns. So: drop whole
 * sentences if that fits, otherwise leave it alone and let the timeline say
 * so.
 */
export function fitToBudget(text: string, maxWords: number): string {
  const clean = text.trim();
  const count = (t: string): number => t.split(/\s+/).filter(Boolean).length;
  if (count(clean) <= maxWords) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (sentences) {
    let kept = '';
    for (const sentence of sentences) {
      const next = (kept + sentence).trim();
      if (count(next) > maxWords) break;
      kept = next;
    }
    if (kept) return kept;
  }
  return clean;
}

/** Overload is transient and this is one request, so it is ours to sit out. */
const OVERLOAD_BACKOFF_MS = [4000, 12_000];

function overloaded(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes('high demand') || m.includes('overloaded') || m.includes('unavailable');
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function write(
  steps: StepIn[],
  brief: string,
  apiKey: string,
  model: string,
): Promise<Array<{ step: number; text: string }>> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (brief.trim()) parts.push({ text: `What this demo is about:\n${brief.trim()}\n` });
  parts.push({ text: `The demo has ${steps.length} steps.\n` });
  for (const s of thinFrames(steps)) {
    parts.push({ text: describeStep(s) });
    if (s.frame) parts.push({ inlineData: { mimeType: 'image/jpeg', data: s.frame } });
  }
  parts.push({
    text: 'Now write the narration. One line per step at most, each within its word budget.',
  });

  const ask = (): Promise<{ text?: string }> =>
    ai.models.generateContent({
      model,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
      },
      contents: [{ role: 'user', parts }],
    });

  let res: { text?: string };
  for (let attempt = 0; ; attempt++) {
    try {
      res = await ask();
      break;
    } catch (e) {
      const backoff = OVERLOAD_BACKOFF_MS[attempt];
      if (backoff === undefined || !overloaded(e)) throw e;
      await pause(backoff);
    }
  }

  const body = JSON.parse(res.text ?? '{}') as { lines?: Array<{ step?: unknown; text?: unknown }> };
  const budget = new Map(steps.map((s) => [s.index, s.maxWords]));
  const out: Array<{ step: number; text: string }> = [];
  for (const l of body.lines ?? []) {
    if (typeof l.step !== 'number' || typeof l.text !== 'string') continue;
    const max = budget.get(l.step);
    if (max === undefined) continue;
    const text = fitToBudget(l.text, max);
    if (text) out.push({ step: l.step, text });
  }
  return out;
}

/** Google nests its error JSON inside the SDK's message string. */
function readable(e: unknown): string {
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
  return msg.trim() || 'The writer failed.';
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
): Promise<void> {
  const apiKey = env.GEMINI_API_KEY ?? '';
  const model = env.GEMINI_SCRIPT_MODEL || DEFAULT_MODEL;

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        apiKey
          ? { ok: true, model }
          : { ok: false, error: 'GEMINI_API_KEY is not set for the dev server.' },
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
    if (!apiKey) return fail(503, 'GEMINI_API_KEY is not set for the dev server.');
    const body = JSON.parse(await readBody(req)) as { steps?: StepIn[]; brief?: unknown };
    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (steps.length === 0) return fail(400, 'No steps to write about.');

    const lines = await write(
      steps,
      typeof body.brief === 'string' ? body.brief.slice(0, 2000) : '',
      apiKey,
      model,
    );
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ lines, model }));
  } catch (e) {
    fail(500, readable(e));
  }
}

export function scriptPlugin(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: 'demoforge-script',
    configResolved(config) {
      const app = config.envDir ?? config.root;
      const repo = resolve(config.root, '..', '..');
      env = { ...loadEnv(config.mode, repo, ''), ...loadEnv(config.mode, app, '') };
    },
    configureServer(server) {
      server.middlewares.use('/api/script', (req, res) => void handle(req, res, env));
    },
  };
}
