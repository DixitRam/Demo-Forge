# DemoForge — Glossary & Key Decisions

## Glossary
- **Click log / event log** — the time-ordered `DemoEvent[]` recording every
  click/action with normalized coordinates and the target element. The thing that
  drives auto-zoom.
- **DemoRecording** — the single data type everything flows through (video meta +
  viewport + events). See `02_ARCHITECTURE.md`.
- **Zoom keyframe** — a computed instruction: from time A to B, zoom to scale S
  centered at (x,y). Produced by the zoom planner from the click log.
- **Zoom planner** — pure function `planZooms(rec, cfg)` turning a click log into
  zoom keyframes. Shared across all phases.
- **Compositor** — the canvas/WebGL layer that draws video frame + zoom/pan +
  synthetic cursor + background frame.
- **Synthetic cursor** — a cursor the editor draws itself (not the captured OS
  cursor), smoothed between click points. Required so Phase 3 (Playwright, no real
  cursor) works.
- **tabCapture vs getDisplayMedia** — two ways to capture the screen in-browser.
  tabCapture = clean single tab, no OS cursor. getDisplayMedia = user picks a
  source, includes OS cursor.
- **Screenity** — open-source GPLv3 screen recorder; the base Trupeer forked. We
  are NOT forking it.
- **Trupeer.ai** — the reference product / UX north star.

## Key decisions and why

### D1. Build the extension from scratch (MIT), not fork Screenity (GPLv3)
Click capture is ~40 lines (DOM listeners + `getDisplayMedia`/`tabCapture`).
Not worth inheriting GPLv3 obligations and a large legacy codebase (annotations,
drawing, camera) we don't need. Clean, fully-owned code wins.

### D2. The editor is a web app; capture is a separate extension
Decouples capture from editing. This is exactly what lets Phase 3's Playwright
capture feed the same editor. Chosen deliberately.

### D3. Auto-zoom is click-log driven, never computer vision
The browser gives click coordinates for free. This is how Trupeer does it, it's
far more reliable than pixel analysis, and it's what makes the Playwright twist
natural (a script is already a click log).

### D4. One `DemoRecording` type, and nothing branches on `source`
This single rule is why the whole editor/zoom/export pipeline is built once in
Phase 1 and reused in Phases 2 and 3 unchanged. Treat it as sacred.

### D5. Normalize coordinates to 0..1; convert to pixels late
Kills a whole class of "zoom lands in the wrong place" bugs across different
resolutions, DPRs, and viewports (including Playwright's viewport in Phase 3).

### D6. Render our own synthetic cursor
So Phase 3 works (Playwright doesn't move a real cursor) and so we control the
polish (smoothing, click bounce) regardless of capture source.

### D7. Audio is a separate, late-muxed track
Keeps Phase 2 AI voiceover from requiring any change to zoom/compositing logic.

### D8. ffmpeg.wasm first, server render later
Fastest path to a working in-browser export in Phase 1; leave a clear upgrade
path for quality/speed and for muxing AI voiceover in Phase 2.

## Naming
Project codename: **DemoForge** (rename freely). Package scope suggestion:
`@demoforge/core`, `@demoforge/extension`, `@demoforge/editor`.

## Non-goals (for the whole project, unless revisited)
- Recording native desktop apps (we target web apps; extension-based capture).
- Talking-head avatars (optional, low priority).
- A general-purpose video editor (we do demo-specific auto-zoom + frame + voice).
