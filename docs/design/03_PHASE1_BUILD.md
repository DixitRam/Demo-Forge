# DemoForge — Phase 1 Build Spec (BUILD THIS)

> Build **only** what's in this document. Read `02_ARCHITECTURE.md` first — the
> contract there is binding. Do NOT scaffold Phase 2 (AI) or Phase 3 (Playwright).

## Goal of Phase 1
Prove the core magic end to end: **record a web app → capture clicks →
auto-zoom onto each click → frame it nicely → export an MP4** — and build the
editor that all later phases reuse. No AI. No Playwright. No auth. No cloud.

---

## Deliverables

### 1. `packages/core` — build this FIRST
- `types.ts` — exactly the types in `02_ARCHITECTURE.md`.
- `zoom-planner.ts` — pure `planZooms(rec, cfg)` returning `ZoomKeyframe[]`.
  - Debounce clicks (default 400ms).
  - Skip zoom when target element area > 60% of viewport.
  - Hold ~1200ms after a click, ease out over ~500ms.
  - Clamp the pan box so zoom never shows outside the video edges.
  - Idle state = scale 1.0, centered.
  - All thresholds live in a `ZoomConfig` with defaults; no magic numbers inline.
- `test/zoom-planner.test.ts` — write a hand-authored sample `DemoRecording`
  (5–6 clicks, one rapid double-click, one giant-element click) and assert the
  keyframes are sensible (right count, right targets, double-click merged, giant
  element skipped). Use vitest.

**Do not move on until these tests pass.** This module is the spine.

### 2. `apps/extension` — MV3 Chrome extension, MIT, from scratch
Not a Screenity fork. Minimal.

Files:
- `manifest.json` — MV3, permissions: `tabCapture` (or `desktopCapture`),
  `activeTab`, `scripting`, `downloads`. Content script matches `<all_urls>`.
- `src/recorder.ts` — start/stop capture with `chrome.tabCapture` +
  `MediaRecorder` (VP9/WebM). Capture `t0 = performance.now()` at
  `recorder.start()`.
- `src/content.ts` — inject listeners; build `DemoEvent[]`:
  - `click`: record `t`, `xNorm`, `yNorm`, and `el` (tag, trimmed text ≤60 chars,
    `getBoundingClientRect`).
  - `input`, `scroll`, `nav` (via `popstate`/`hashchange` or navigation events):
    record lightweight events (used later; fine to capture now).
  - Record `viewport {w,h,dpr}` at start and on `resize`.
  - Message events to the background/recorder so `t` shares the same `t0` clock.
- `src/background.ts` — orchestrate; on stop, assemble a `DemoRecording` JSON +
  the webm blob and **download both** (`demo.json` + `recording.webm`).
- `src/popup/` — tiny popup: Start / Stop, a recording indicator, and a
  "recorded N events" counter. No settings, no annotations, no webcam.

**Recommend in a code comment** whether to use `tabCapture` (clean single tab,
no OS cursor in frame — good since we render our own cursor) vs `getDisplayMedia`
(real cursor, user must pick source). Default recommendation: **tabCapture**,
because the editor renders its own cursor and zoom from the log, so we don't need
the OS cursor and we get a cleaner frame.

**Explicitly OUT of scope:** annotations, drawing tools, webcam overlay, audio
narration recording UI (system/mic audio capture is optional; if trivial with
tabCapture, keep the audio track for later — but do not build UI around it),
accounts, cloud.

### 3. `apps/editor` — Vite + React + TS + Tailwind
The editor lives here (web app), as chosen.

Features:
1. **Import**: drag-and-drop `demo.json` + `recording.webm` (or a single bundle).
   Parse into a `DemoRecording` + an `HTMLVideoElement` source.
2. **Canvas preview player** (PixiJS recommended, plain canvas acceptable):
   - Draw the current video frame to a canvas each tick.
   - Compute the active zoom from `planZooms()` at the current time; apply
     scale + translate toward `(targetXNorm, targetYNorm)` with easing.
   - Render a **synthetic cursor** that moves between click points (smoothed).
     This is important: it's what makes Phase 3 (no real cursor) work for free.
   - Play/pause/scrub controls.
3. **Timeline** with zoom "pills":
   - Show each `ZoomKeyframe` as a draggable/resizable block on a time ruler.
   - Add / delete / move / resize zooms; edits update the preview live.
   - A global zoom on/off and a scale slider are fine.
4. **Background / frame compositing**:
   - Composite the recording over: solid color | gradient | wallpaper image.
   - Adjustable padding, corner radius, drop shadow.
5. **Export to MP4**:
   - Render composited canvas frames + the original audio track (if any) to MP4
     via **ffmpeg.wasm**.
   - Add a `// TODO: server-side ffmpeg render` note for the quality/speed
     upgrade path.

**Explicitly OUT of scope:** auth, multi-user, saving projects to a server, any
AI, script/document editing, Playwright, translation.

---

## Build order (ship each working before the next)
1. `packages/core` types + `zoom-planner` + passing vitest tests.
2. Extension: capture + click log + download bundle. **Manually verify** the
   `demo.json` timestamps line up with the video (click at 3s in video ≈ event
   `t≈3000`).
3. Editor: import + canvas player + apply zoom keyframes. Confirm zoom **lands on
   the clicked element**.
4. Editor: synthetic cursor movement between clicks.
5. Editor: timeline editing of zoom pills (add/move/resize/delete, live update).
6. Editor: background/frame compositing.
7. Editor: ffmpeg.wasm MP4 export.

---

## Acceptance test
Record a ~30s demo clicking through any web dashboard. Import into the editor.
The exported MP4 must:
- Play the demo smoothly.
- **Zoom toward each meaningful click and ease back out** (rapid double-clicks
  merged; clicks on huge elements not zoomed).
- Show a smooth synthetic cursor.
- Sit on a padded, rounded, shadowed background.
- Reflect at least one **manual timeline edit** (a zoom the user moved/removed).
No AI. No Playwright.

---

## Top risks — surface these to the human if they appear
1. **Timing drift** between `demo.json` and video → zoom fires at wrong moment.
   Mitigate with the shared `t0` clock; reconcile against `video.durationMs`.
2. **Coordinate/DPR mismatch** → zoom lands off-target. Mitigate by storing only
   normalized 0..1 coords and converting to video pixels at render time.
3. **ffmpeg.wasm speed/quality** → acceptable for Phase 1; note server-render
   upgrade path.
4. **tabCapture audio** quirks → audio is optional in Phase 1; don't block on it.

## Definition of done
All 7 build-order steps complete, acceptance test passes, `zoom-planner` unit
tests green, and the forward-compatibility checklist in `02_ARCHITECTURE.md`
still holds true.
