/**
 * Orchestrator. Owns the recording state, collects the click log from the
 * content script, and on stop assembles the one and only DemoRecording and
 * downloads it next to the .webm.
 */

import type { DemoEvent, DemoRecording, DemoViewport } from '@demoforge/core';
import type {
  ContentMessage,
  FinalFlushReply,
  StartedReply,
  StatusReply,
  StoppedReply,
  UiMessage,
} from './messages.js';

interface RecState {
  recording: boolean;
  t0: number;
  tabId: number;
  createdAt: string;
  events: DemoEvent[];
  viewport: DemoViewport | null;
}

const EMPTY: RecState = {
  recording: false,
  t0: 0,
  tabId: -1,
  createdAt: '',
  events: [],
  viewport: null,
};

// The service worker can be torn down mid-recording, so the take lives in
// session storage rather than in a module-level variable.
async function getState(): Promise<RecState> {
  const { df } = await chrome.storage.session.get('df');
  return (df as RecState | undefined) ?? EMPTY;
}

async function setState(s: RecState): Promise<void> {
  await chrome.storage.session.set({ df: s });
}

// Serialise read-modify-write so 1/s event flushes cannot clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function badge(on: boolean): Promise<void> {
  await chrome.action.setBadgeText({ text: on ? 'REC' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record the captured tab with MediaRecorder.',
  });
}

/**
 * A freshly created offscreen document has not necessarily registered its
 * onMessage listener yet, so the first send can fail with "could not establish
 * connection". Retry briefly rather than losing the take.
 */
async function askOffscreen<T>(msg: unknown, attempts = 20): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return (await chrome.runtime.sendMessage(msg)) as T;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error('unreachable');
}

/** Talk to the content script, injecting it first if the page predates us. */
async function tellTab<T>(tabId: number, msg: unknown): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return (await chrome.tabs.sendMessage(tabId, msg)) as T;
    } catch {
      return undefined;
    }
  }
}

async function start(): Promise<StatusReply> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return { recording: false, eventCount: 0, error: 'Open an http(s) page to record.' };
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await ensureOffscreen();

  const started = await askOffscreen<StartedReply>({ type: 'DF_OFFSCREEN_START', streamId });
  if (started.error) return { recording: false, eventCount: 0, error: started.error };

  await setState({
    recording: true,
    t0: started.t0,
    tabId: tab.id,
    createdAt: new Date().toISOString(),
    events: [],
    viewport: null,
  });

  await tellTab(tab.id, { type: 'DF_REC_START', t0: started.t0 });
  await badge(true);
  return { recording: true, eventCount: 0 };
}

async function stop(): Promise<StatusReply> {
  const s = await getState();
  if (!s.recording) return { recording: false, eventCount: 0 };

  // Stop the log first so we keep every event up to the moment of stopping.
  const tail = await tellTab<FinalFlushReply>(s.tabId, { type: 'DF_REC_STOP' });
  const events = [...s.events, ...(tail?.events ?? [])].sort((a, b) => a.t - b.t);
  const viewport = s.viewport ?? tail?.viewport ?? null;

  const stopped = await askOffscreen<StoppedReply | null>({ type: 'DF_OFFSCREEN_STOP' });
  await setState(EMPTY);
  await badge(false);

  if (!stopped) return { recording: false, eventCount: events.length, error: 'Recorder was not running.' };
  if (!viewport) {
    return { recording: false, eventCount: 0, error: 'No click log — the page blocked the content script.' };
  }

  const rec: DemoRecording = {
    source: 'extension',
    createdAt: s.createdAt,
    video: {
      durationMs: stopped.durationMs,
      width: stopped.width,
      height: stopped.height,
      mime: stopped.mime,
    },
    viewport,
    audioTrack: stopped.hasAudio,
    events,
  };

  // TODO Phase 2: POST DemoRecording to backend for storage/AI
  const { url: jsonUrl } = await askOffscreen<{ url: string }>({
    type: 'DF_OFFSCREEN_BLOB',
    text: JSON.stringify(rec, null, 2),
    mime: 'application/json',
  });

  const dir = `demoforge/${s.createdAt.replace(/[:.]/g, '-')}`;
  await chrome.downloads.download({ url: stopped.videoUrl, filename: `${dir}/recording.webm` });
  await chrome.downloads.download({ url: jsonUrl, filename: `${dir}/demo.json` });

  // The offscreen document is left open on purpose: it owns those blob: URLs,
  // and closing it would revoke them out from under the in-flight downloads.
  return { recording: false, eventCount: events.length };
}

chrome.runtime.onMessage.addListener(
  (msg: UiMessage | ContentMessage, _sender, sendResponse) => {
    if (msg.type === 'DF_START') {
      serial(start).then(sendResponse, (e: unknown) =>
        sendResponse({ recording: false, eventCount: 0, error: String(e) } satisfies StatusReply),
      );
      return true;
    }

    if (msg.type === 'DF_STOP') {
      serial(stop).then(sendResponse, (e: unknown) =>
        sendResponse({ recording: false, eventCount: 0, error: String(e) } satisfies StatusReply),
      );
      return true;
    }

    if (msg.type === 'DF_STATUS') {
      void getState().then((s) =>
        sendResponse({ recording: s.recording, eventCount: s.events.length } satisfies StatusReply),
      );
      return true;
    }

    if (msg.type === 'DF_HELLO') {
      void getState().then((s) => sendResponse({ recording: s.recording, t0: s.t0 }));
      return true;
    }

    if (msg.type === 'DF_EVENTS') {
      const { events, viewport } = msg;
      void serial(async () => {
        const s = await getState();
        if (!s.recording) return;
        await setState({
          ...s,
          events: [...s.events, ...events],
          viewport: s.viewport ?? viewport,
        });
      });
      sendResponse({ ok: true });
      return false;
    }

    return false;
  },
);
