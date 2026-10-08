# DemoForge — Start Here

> **If you are Claude Code reading this cold: read the docs in this order.**
> 1. `00_README_START_HERE.md` (this file) — what we're building and why
> 2. `01_PRODUCT_VISION.md` — full product, all 3 phases, competitor analysis
> 3. `02_ARCHITECTURE.md` — the technical spine that makes all phases work
> 4. `03_PHASE1_BUILD.md` — **the only thing to build right now**
> 5. `04_PHASE2_PREVIEW.md` — AI voiceover/transcript (context only, do NOT build)
> 6. `05_PHASE3_PREVIEW.md` — Playwright re-record (context only, do NOT build)
> 7. `06_GLOSSARY_AND_DECISIONS.md` — terms + why we chose what we chose

---

## The one-paragraph pitch

DemoForge turns a screen recording of a web app into a polished product-demo
video — with **automatic zoom on every click**, a clean framed background, and
(later) AI voiceover. It's a self-hosted Trupeer.ai. The long-term differentiator:
demos are driven by **Playwright scripts**, so when the product's UI changes, an
AI updates the script and the demo **re-records itself** — no human re-shooting.

## The single most important idea in this whole project

**Auto-zoom is driven by a structured click log, not computer vision.**

```
click log:  [ {t: 1200ms, x: 0.42, y: 0.31, element: "Add Widget button"}, ... ]
                                    │
                                    ▼
                        zoom planner (pure function)
                                    │
                                    ▼
                zoom keyframes → editor → composited MP4
```

Where the click log comes from changes per phase, but **everything after it is
identical**:
- **Phase 1:** a Chrome extension records the log while a human clicks.
- **Phase 3:** a Playwright script *is* the log (every `page.click` is a known
  coordinate + element).

Because the editor and zoom engine only ever consume a `DemoRecording` object
and never ask where it came from, the entire downstream pipeline is built once
in Phase 1 and reused forever. **Protect this contract above all else.**

## What to build right now
Only **Phase 1**: record → capture clicks → auto-zoom → background/frame → export MP4.
No AI. No Playwright. See `03_PHASE1_BUILD.md`.

## Tech stack (whole project)
- **Extension:** Manifest V3, TypeScript, MIT-licensed, from scratch (not a fork)
- **Editor:** Vite + React + TypeScript + Tailwind, Canvas/WebGL (PixiJS) compositor
- **Shared core:** pure TypeScript package (`types` + `zoom-planner`)
- **Export:** ffmpeg.wasm (Phase 1) → server-side ffmpeg (later)
- **Monorepo:** pnpm workspaces
- **AI (Phase 2+):** TTS provider (ElevenLabs/Cartesia), an LLM for scripts
- **Re-record (Phase 3):** Playwright
