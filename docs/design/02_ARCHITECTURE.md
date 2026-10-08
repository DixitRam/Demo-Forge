# DemoForge — Architecture

This document defines the technical spine. **The rules here matter more than any
individual feature.** They are what let Phase 1's editor be reused unchanged in
Phases 2 and 3.

---

## The central contract

Everything flows through one data type. Define it **once** in the shared `core`
package. Both the extension and the editor import it. In Phase 3, Playwright
emits the same type.

```ts
// packages/core/src/types.ts

export type DemoSource = 'extension' | 'playwright';

export interface DemoElement {
  tag: string;                 // 'button', 'a', 'input', ...
  text?: string;               // visible text, trimmed, <= 60 chars
  rect: { x: number; y: number; w: number; h: number }; // CSS px, from getBoundingClientRect
}

export interface DemoEvent {
  t: number;                   // ms since recording start (t0 = MediaRecorder.start())
  type: 'click' | 'input' | 'scroll' | 'nav';
  xNorm: number;               // 0..1  (clientX / innerWidth)
  yNorm: number;               // 0..1  (clientY / innerHeight)
  el?: DemoElement;
}

export interface DemoViewport {
  w: number;                   // innerWidth at capture
  h: number;                   // innerHeight at capture
  dpr: number;                 // devicePixelRatio
}

export interface DemoRecording {
  source: DemoSource;          // downstream code MUST NOT branch on this
  createdAt: string;           // ISO
  video: { durationMs: number; width: number; height: number; mime: string };
  viewport: DemoViewport;
  audioTrack?: boolean;        // was mic/system audio captured
  events: DemoEvent[];         // time-ordered
}
```

### The rule that protects the future
> **No code downstream of `DemoRecording` may read `source` to change behavior.**

The zoom planner, the editor UI, the compositor, and the exporter all take a
`DemoRecording` and treat extension-captured and Playwright-captured demos
identically. If you ever feel tempted to write `if (rec.source === ...)`, stop —
that's the seam that would break Phase 3 reuse.

---

## Coordinate discipline (the #1 correctness rule)

There are at least three coordinate spaces in play:
- **CSS pixels** (`clientX/Y`, `getBoundingClientRect`) — what the DOM gives you.
- **Device pixels** (`CSS px * dpr`) — closer to captured video pixels.
- **Captured video pixels** — the actual recorded resolution, which may differ
  from the viewport (e.g. tabCapture resolution, retina scaling).

**Rule: store everything as normalized 0..1 (`xNorm`, `yNorm`) and convert to
video pixels as late as possible, using the video's actual width/height at
render time.** This makes zoom land on the right spot regardless of resolution,
DPR, or window size. Never store raw pixel coordinates in `DemoRecording`.

---

## Timing discipline (the #2 correctness rule)

Auto-zoom looks broken if it fires early or late. The fix:
- Capture `t0 = performance.now()` at the exact moment `MediaRecorder.start()`
  is called.
- Every `DemoEvent.t = performance.now() - t0`.
- The video's frame at wall-clock `t` corresponds to event `t`. Keep them on the
  same clock.
- If the recorder drops frames or the container reports a different duration,
  reconcile against `video.durationMs` and scale if needed — but log a warning.

---

## Pipeline stages (Phase 1)

```
[Extension]
  tab capture  ──► recording.webm
  content script ─► events.json  (DemoEvent[])
  bundle ─────────► DemoRecording  ──► handoff to editor
                                         │
[Editor / core]                          ▼
  zoom-planner.ts:  DemoRecording ──► ZoomKeyframe[]
  player:           video + ZoomKeyframe[] ──► live canvas preview
  timeline:         user edits ZoomKeyframe[]
  compositor:       video frame + zoom + background/frame ──► canvas
  exporter:         canvas frames + audio ──► MP4 (ffmpeg.wasm)
```

## The zoom planner (pure, reused in every phase)

```ts
// packages/core/src/zoom-planner.ts

export interface ZoomKeyframe {
  tStart: number; tEnd: number;         // ms
  targetXNorm: number; targetYNorm: number;
  scale: number;                        // 1.0 = no zoom
  easing: 'linear' | 'easeInOutCubic';
}

export interface ZoomConfig {
  debounceMs: number;        // default 400  — merge clicks closer than this
  holdMs: number;            // default 1200 — stay zoomed after a click
  zoomScale: number;         // default 1.8
  maxTargetAreaRatio: number;// default 0.6  — skip zoom if element bigger than this fraction of viewport
  transitionMs: number;      // default 500  — ease in/out duration
}

export function planZooms(rec: DemoRecording, cfg?: Partial<ZoomConfig>): ZoomKeyframe[];
```
Pure function. No DOM, no React, no I/O. Fully unit-testable with sample logs.
This is the literal same code path for a human recording and a Playwright run.

---

## Repo layout

```
demoforge/
  pnpm-workspace.yaml
  package.json
  packages/
    core/
      src/types.ts
      src/zoom-planner.ts
      src/index.ts
      test/zoom-planner.test.ts
  apps/
    extension/          # MV3, TS, MIT
      manifest.json
      src/background.ts
      src/content.ts     # click log
      src/recorder.ts    # capture
      src/popup/…
    editor/              # Vite + React + TS + Tailwind
      src/…
```

- `core` is imported by both `extension` and `editor`. It has **zero**
  dependencies on browser-extension or React APIs.

---

## Handoff extension → editor (Phase 1)
Two options, pick the simpler:
1. **Download bundle:** extension downloads `recording.webm` + `demo.json`
   (the `DemoRecording`, with the webm referenced/embedded). User drops both
   into the editor. Simplest, no backend.
2. **Direct pass:** extension opens the editor tab and transfers the blob via
   `postMessage`. Nicer UX, a bit more wiring.

Leave `// TODO Phase 2: POST DemoRecording to backend for storage/AI` where the
upload would go.

---

## Forward-compatibility checklist (keep these true)
- [ ] `DemoRecording` is the only thing the editor consumes.
- [ ] Nothing downstream branches on `source`.
- [ ] All coordinates normalized 0..1 in stored data.
- [ ] `zoom-planner` is pure and in `core`.
- [ ] Editor renders its **own** cursor + zoom from the log (does not depend on a
      real OS cursor being present) — this is what makes Phase 3 Playwright work.
- [ ] Audio is a separate track layered at export, not baked into zoom logic.
