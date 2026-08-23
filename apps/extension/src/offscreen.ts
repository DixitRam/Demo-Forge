/**
 * Offscreen document: the only extension context that can run getUserMedia and
 * MediaRecorder under MV3. It also mints the blob: URLs, because a service
 * worker has no URL.createObjectURL.
 */

import type { OffscreenMessage, StartedReply, StoppedReply } from './messages.js';
import { startRecording, type ActiveRecording } from './recorder.js';

let active: ActiveRecording | null = null;

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (msg.type === 'DF_OFFSCREEN_START') {
    startRecording(msg.streamId).then(
      (rec) => {
        active = rec;
        sendResponse({ t0: rec.t0, mime: rec.mime } satisfies StartedReply);
      },
      (err: unknown) => {
        sendResponse({ t0: 0, mime: '', error: String(err) } satisfies StartedReply);
      },
    );
    return true;
  }

  if (msg.type === 'DF_OFFSCREEN_STOP') {
    const rec = active;
    active = null;
    if (!rec) {
      sendResponse(null);
      return false;
    }
    void rec.stop().then((r) => {
      sendResponse({
        durationMs: r.durationMs,
        width: r.width,
        height: r.height,
        mime: r.mime,
        hasAudio: r.hasAudio,
        videoUrl: URL.createObjectURL(r.blob),
      } satisfies StoppedReply);
    });
    return true;
  }

  if (msg.type === 'DF_OFFSCREEN_BLOB') {
    sendResponse({ url: URL.createObjectURL(new Blob([msg.text], { type: msg.mime })) });
    return false;
  }

  return false;
});
