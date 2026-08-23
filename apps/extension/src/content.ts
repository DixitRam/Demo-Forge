/**
 * The click log. Injected into every page; only records while the background
 * says a recording is running.
 *
 * Coordinate discipline (risk #2): we store ONLY normalised 0..1 coordinates.
 * `el.rect` stays in CSS px because the zoom planner uses it solely for an
 * area ratio against the CSS-px viewport, where the DPR cancels out. Nothing
 * downstream ever positions anything from it.
 */

import type { DemoElement, DemoEvent, DemoViewport } from '@demoforge/core';
import { nowWall } from './clock.js';
import { describeElement, normPoint } from './log-shape.js';
import type { ContentMessage, FinalFlushReply, RecMessage } from './messages.js';

const FLUSH_MS = 1000; // also keeps the MV3 service worker from idling out
const SCROLL_THROTTLE_MS = 200;
const INPUT_THROTTLE_MS = 500;
let t0: number | null = null;
let buffer: DemoEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let startViewport: DemoViewport | null = null;
let lastScroll = 0;
let lastInput = 0;

function viewport(): DemoViewport {
  return { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio };
}

function stamp(): number {
  return nowWall() - t0!;
}

function norm(clientX: number, clientY: number): { xNorm: number; yNorm: number } {
  return normPoint(clientX, clientY, window.innerWidth, window.innerHeight);
}

function describe(target: EventTarget | null): DemoElement | undefined {
  return target instanceof Element ? describeElement(target) : undefined;
}

function push(ev: DemoEvent): void {
  if (t0 === null) return;
  buffer.push(ev);
}

function send(msg: ContentMessage): void {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    // Extension reloaded mid-recording; nothing useful to do from here.
  }
}

function flush(): void {
  if (t0 === null || buffer.length === 0) {
    // Still ping so the service worker stays alive through quiet stretches.
    if (t0 !== null) send({ type: 'DF_EVENTS', events: [], viewport: startViewport ?? viewport() });
    return;
  }
  const events = buffer;
  buffer = [];
  send({ type: 'DF_EVENTS', events, viewport: startViewport ?? viewport() });
}

function beginRecording(newT0: number): void {
  t0 = newT0;
  buffer = [];
  startViewport = viewport();
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flush, FLUSH_MS);
}

function endRecording(): FinalFlushReply {
  const reply: FinalFlushReply = {
    events: buffer,
    viewport: startViewport ?? viewport(),
  };
  buffer = [];
  t0 = null;
  startViewport = null;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  return reply;
}

// --- listeners (registered once; they no-op unless a recording is running) ---

// Capture phase, so a page that stops propagation cannot hide clicks from us.
window.addEventListener(
  'click',
  (e) => push({ t: stamp(), type: 'click', ...norm(e.clientX, e.clientY), el: describe(e.target) }),
  true,
);

window.addEventListener(
  'input',
  (e) => {
    const now = nowWall();
    if (now - lastInput < INPUT_THROTTLE_MS) return;
    lastInput = now;
    const el = e.target instanceof Element ? e.target.getBoundingClientRect() : null;
    const p = el ? norm(el.x + el.width / 2, el.y + el.height / 2) : { xNorm: 0.5, yNorm: 0.5 };
    push({ t: stamp(), type: 'input', ...p, el: describe(e.target) });
  },
  true,
);

window.addEventListener(
  'scroll',
  () => {
    const now = nowWall();
    if (now - lastScroll < SCROLL_THROTTLE_MS) return;
    lastScroll = now;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    push({ t: stamp(), type: 'scroll', xNorm: 0.5, yNorm: max > 0 ? window.scrollY / max : 0 });
  },
  true,
);

for (const evt of ['popstate', 'hashchange'] as const) {
  window.addEventListener(evt, () => push({ t: stamp(), type: 'nav', xNorm: 0, yNorm: 0 }));
}

window.addEventListener('resize', () => {
  if (t0 === null) return;
  const v = viewport();
  const s = startViewport;
  if (s && (s.w !== v.w || s.h !== v.h)) {
    // DemoRecording holds a single viewport, so we keep the one from the start
    // of the recording. Resizing mid-take also changes what tabCapture emits,
    // which no amount of bookkeeping here can fix.
    console.warn('[DemoForge] viewport changed during recording; zoom targeting may drift.');
  }
});

window.addEventListener('pagehide', flush);

chrome.runtime.onMessage.addListener((msg: RecMessage, _sender, sendResponse) => {
  if (msg.type === 'DF_REC_START') {
    beginRecording(msg.t0);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'DF_REC_STOP') {
    sendResponse(endRecording());
    return false;
  }
  return false;
});

// A navigation mid-recording gives us a fresh content script; ask whether a
// take is already running so we keep stamping against the same t0.
void chrome.runtime.sendMessage({ type: 'DF_HELLO' } satisfies ContentMessage).then(
  (reply: { recording: boolean; t0: number } | undefined) => {
    if (reply?.recording) beginRecording(reply.t0);
  },
  () => {},
);
