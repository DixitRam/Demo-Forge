import type { DemoEvent, DemoViewport } from '@demoforge/core';

/** popup -> background */
export type UiMessage =
  | { type: 'DF_START' }
  | { type: 'DF_STOP' }
  | { type: 'DF_STATUS' };

/** content -> background */
export type ContentMessage =
  | { type: 'DF_HELLO' }
  | { type: 'DF_EVENTS'; events: DemoEvent[]; viewport: DemoViewport };

/** background -> content (via chrome.tabs.sendMessage) */
export type RecMessage =
  | { type: 'DF_REC_START'; t0: number }
  | { type: 'DF_REC_STOP' };

/** background -> offscreen (via chrome.runtime.sendMessage) */
export type OffscreenMessage =
  | { type: 'DF_OFFSCREEN_START'; streamId: string }
  | { type: 'DF_OFFSCREEN_STOP' }
  | { type: 'DF_OFFSCREEN_BLOB'; text: string; mime: string };

export interface StatusReply {
  recording: boolean;
  eventCount: number;
  error?: string;
}

export interface StartedReply {
  t0: number;
  mime: string;
  error?: string;
}

export interface StoppedReply {
  durationMs: number;
  width: number;
  height: number;
  mime: string;
  hasAudio: boolean;
  videoUrl: string;
}

/** content's reply to DF_REC_STOP: whatever it had not flushed yet. */
export interface FinalFlushReply {
  events: DemoEvent[];
  viewport: DemoViewport;
}
