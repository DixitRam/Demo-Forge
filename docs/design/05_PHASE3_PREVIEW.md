# DemoForge — Phase 3 Preview (DO NOT BUILD YET)

> Context only. This is the differentiator and the reason the architecture is
> shaped the way it is. Do not implement now — just don't block it.

## Goal
Make demos **re-record themselves** from a Playwright script. When the product
UI changes, an AI (Claude Code) edits the script, and one click regenerates the
polished video — same auto-zoom, frame, and (Phase 2) voiceover — with no human.

## The flow (future)
1. A demo is represented as a **Playwright script** (authored, or generated from
   a first manual recording via `playwright codegen`).
2. The tool runs the script (headed) driving a real browser through the steps.
3. The run is captured to video. **Critically, the click log is derived from the
   script actions themselves** — each `page.click(selector)` yields the element's
   bounding box + timestamp → a `DemoEvent`. This produces the *same*
   `DemoRecording` shape as the extension.
4. That `DemoRecording` flows into the **exact Phase 1 editor + zoom planner**,
   unchanged. Auto-zoom, frame, cursor, and Phase 2 voiceover all apply.
5. AI-updated script → re-run → fresh video. Old demos never go stale.

## Why this needs almost no new "magic"
The Playwright script is already structured click data. Everything downstream of
`DemoRecording` was built in Phase 1 and is reused verbatim. That's the payoff of
the "never branch on `source`" rule in `02_ARCHITECTURE.md`.

## The one real gotcha to remember: the cursor
Playwright dispatches synthetic events; the **real OS cursor often doesn't
move**, so a screen capture may show clicks with no cursor motion. **Solution:
render our own synthetic cursor + zoom from the click log** — which the Phase 1
editor already does. So if Phase 1 renders its own cursor (as specified), Phase 3
gets correct cursor motion for free. This is why Phase 1 must not depend on a
captured OS cursor.

## How the log is derived from Playwright (sketch, future)
- Wrap/instrument the script so each action logs `{action, selector, t}`.
- After locating the element, read `boundingBox()` → convert to `xNorm/yNorm`
  against the viewport → emit a `DemoEvent`.
- Timestamps relative to run start (same `t0` discipline as Phase 1).
- Assemble `DemoRecording` with `source: 'playwright'` — and nothing downstream
  cares.

## Capture options (decide later)
- Playwright's own `recordVideo`, or a screen recorder around the headed browser,
  or CDP screencast. Whichever gives clean frames; the editor composites cursor +
  zoom regardless.

## What Phase 1/2 must keep true for this to work
- Editor renders its **own** cursor + zoom from the log (no OS-cursor dependency).
- Nothing downstream branches on `DemoRecording.source`.
- Coordinates normalized 0..1 so Playwright viewport ≠ manual viewport is fine.
- Zoom planner is pure and shared (a Playwright log runs through the identical
  path).
