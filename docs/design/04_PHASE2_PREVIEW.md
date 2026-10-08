# DemoForge — Phase 2 Preview (DO NOT BUILD YET)

> Context only. This exists so Phase 1 decisions don't accidentally block Phase 2.
> Do not implement any of this now.

## Goal
Add the AI layer on top of the Phase 1 editor: generated narration script, AI
voiceover, and translation — the "Trupeer feel."

## Features (future)
1. **Script generation.** From the `DemoEvent[]` (and optionally a rough
   transcript if the user talked while recording), an LLM writes a clean,
   step-by-step narration script. Each script line is tied to a time range /
   step so it stays in sync with the video.
2. **AI voiceover.** Send the script to a TTS provider (e.g. ElevenLabs,
   Cartesia, or similar). Produce an audio track timed to the steps. Multiple
   voices/accents.
3. **"Edit like a document."** User edits the script text; the voiceover and
   timing regenerate for changed lines only.
4. **Translation.** Translate script + regenerate voiceover in other languages.
5. **Optional written guide.** Generate a Markdown/PDF walkthrough with
   screenshots (frames grabbed at each step) alongside the video.

## How Phase 1 must NOT block this (things to keep true)
- Keep the **narration/audio as a separate track**, layered at export — never
  bake audio assumptions into the zoom logic.
- Keep `DemoEvent.el.text` and step boundaries in the recording, so the LLM has
  material to write a script from.
- Keep the exporter able to mux an **externally supplied audio track** (not just
  the originally captured one).
- Keep step/segment timing derivable from `DemoEvent[]` (clicks are natural step
  boundaries).

## New pieces Phase 2 will add (not now)
- A backend (the Phase 1 `// TODO` upload points) to store `DemoRecording`, call
  LLM + TTS, and hold generated assets.
- API keys / provider config.
- Server-side render becomes more attractive here (mux voiceover, higher quality).

## Explicitly still out of scope in Phase 2
- Playwright / re-record (that's Phase 3).
- Avatars/talking heads (optional, only if desired later).
