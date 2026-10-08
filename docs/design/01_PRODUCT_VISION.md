# DemoForge — Product Vision

## The problem we're solving

Teams that build SaaS products constantly need demo videos: for marketing,
onboarding, help centers, sales, and release notes. Making them is painful:
record, re-record when you fumble, manually edit, add zooms, write a script,
record a voiceover. Worse, **the moment the product UI changes, every demo video
is stale** and must be re-shot from scratch.

## What we're building

A tool that:
1. Records a screen demo of a **web application**.
2. Automatically produces a polished video: **smooth zoom onto every meaningful
   click**, a clean padded/rounded background frame, smooth cursor.
3. (Phase 2) Generates an **AI voiceover** and a written script/transcript from
   the actions, and can **translate** it.
4. (Phase 3 — our differentiator) Represents the demo as a **Playwright script**
   so it can be **automatically re-recorded** when the UI changes. An AI (e.g.
   Claude Code) edits the script; the tool re-runs it and regenerates the video
   with no human involved.

## The reference product: Trupeer.ai

Trupeer is the closest existing product and a good UX north star. How it works
(verified from their materials):

- It's a **Chrome extension** that captures the screen **and every click/action**.
- Auto-zoom is applied **based on the click data**, not by analyzing pixels —
  the browser hands you the click coordinates for free.
- Their extension is a **fork of Screenity** (an open-source GPLv3 recorder).
- A cloud editor then adds AI voiceover, avatars, script cleanup, translation,
  and lets you "edit the video like a document."

**What we do the same:** click-driven auto-zoom, AI voiceover, polished output.

**What we do differently (why we exist):** Trupeer requires a human to re-record
when the product changes. We make the demo a **Playwright script**, so it
**re-records itself**. That's the whole bet. Trupeer *cannot* easily do this
because their source of truth is a human recording; ours is executable code.

## Why the Playwright twist is technically natural (not a hack)

A Playwright script already contains, deterministically, every action:
`await page.click('#add-widget')`, `await page.goto('/dashboard')`, etc. From
each action we can derive the exact element, its on-screen bounding box, and the
timestamp. **That is exactly the same click log our auto-zoom already consumes.**
So re-recording needs *less* new machinery than the manual path — the script is
already structured click data. This is the key reason the architecture (see
`02_ARCHITECTURE.md`) treats "where the click log came from" as irrelevant.

## The three phases

### Phase 1 — Record + Auto-Zoom + Frame (build now)
Chrome extension records a web app + click log. Web editor applies auto-zoom,
lets the user tweak it on a timeline, composites over a background, exports MP4.
**No AI, no Playwright.** This proves the core magic (click-driven zoom) end to
end and builds the editor that every later phase reuses.

### Phase 2 — AI layer (later)
- Transcribe/observe the actions → generate a clean **narration script** (LLM).
- **AI voiceover** via a TTS provider, timed to the steps.
- **Translation** of script + voiceover.
- "Edit like a document": change the script, the video/voiceover updates.
- Optional: structured written guide (PDF/Markdown) generated alongside, like Trupeer.

### Phase 3 — Playwright re-record (later, the differentiator)
- Import/author a **Playwright script** for a demo.
- Run it headed; capture video; derive the click log **from the script actions**.
- Feed that log into the **same editor and zoom engine from Phase 1**.
- An AI (Claude Code) edits the script when the product changes → one click
  re-records the whole demo, auto-zoom and all.
- Cursor handling note: Playwright's synthetic events may not move a real OS
  cursor, so we render our **own cursor + zoom from the click log** rather than
  relying on the captured OS cursor. (This is already how the editor works in
  Phase 1, so it's free.)

## Scope discipline
Each phase ships fully working before the next starts. Do not pre-build later
phases. The architecture doc explains how to keep Phase 1 clean so 2 and 3 slot
in without rework.

## Licensing note
We build the extension **from scratch under MIT** rather than forking Screenity
(GPLv3). The click-capture is trivial to write, and we want a clean, fully-owned
codebase. The editor and server pipeline are ours and unencumbered.
