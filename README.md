# DemoForge

Turns a screen recording of a web app into a polished demo video, with
automatic zoom on every click. Phase 1: record → click log → auto-zoom →
framed background → MP4. No AI, no Playwright, no backend.

See `demoforge-docs/` for the product vision and the binding architecture
contract.

## Layout

```
packages/core       @demoforge/core — types, zoom planner, evaluator, cursor path
apps/extension      MV3 Chrome extension (MIT, from scratch) — capture + click log
apps/editor         Vite + React + Tailwind — player, timeline, compositor, export
scripts/            make-fixture.sh — synthetic bundle with known coordinates
```

## Getting started

```sh
pnpm install
pnpm -r test                  # 190 tests
pnpm -C apps/extension build  # then load apps/extension/dist unpacked in Chrome
pnpm -C apps/editor dev
```

Narration needs a voice provider; nothing else does, and the editor tells you
which ones are available.

- **espeak-ng (local)** — `dnf install espeak-ng`. Free, offline, robotic.
- **Gemini AI** — copy `.env.example` to `.env` and put a key in
  `GEMINI_API_KEY`. Sounds like a person. `.env` at the repo root or in
  `apps/editor/` both work; the key is read by the dev server only and never
  reaches the browser.

  A free-tier key allows only a few requests a minute, so generating a long
  script pauses when the quota says to and picks up again — the button tells
  you how long it is waiting.

## The workflow

1. **Record.** Load the extension, open any `http(s)` page, click the DemoForge
   action → Start. It captures the tab with `chrome.tabCapture` and logs every
   click, input, scroll and navigation against the recorder's own clock.
2. **Stop.** Two files land in `~/Downloads/demoforge/<timestamp>/`:
   `recording.webm` and `demo.json` (a `DemoRecording`).
3. **Edit.** Drop both into the editor. Zooms are planned from the click log;
   drag the pills to move or resize them, add and delete, restyle the frame.
4. **Export.** Render to MP4 in the browser via ffmpeg.wasm.

## Editor

An icon rail on the right opens six panels:

| Panel | What it does |
| --- | --- |
| Script & voice | Narration lines on the timeline, drafted from the click log or written by hand, spoken by a local TTS |
| Background | Image / Colour / Gradient tabs — 18 generated wallpapers, custom upload, gradient presets with editable stops and angle |
| Zoom | Auto-zoom toggle, per-zoom or global scale, re-plan from the click log |
| Captions | Add at the playhead, draft a set from the click log, edit text, position / size / colour |
| Effects | Padding, corner radius, shadow blur / offset / strength |
| Layout | Output aspect — Original, 16:9, 9:16, 1:1, 4:3, 4:5 |
| Cursor | Show, click pulse, size, smoothing |

**Aiming a zoom.** Select a pill and the preview drops back to the unzoomed
frame with a rectangle showing exactly what that zoom will crop. Click or drag
anywhere on the frame to move it, and a floating inspector gives you the zoom
level, focus mode, reset and delete.

A zoom's focus is **auto** by default: it points at the nearest click, and
re-aims itself if you drag the pill somewhere else on the timeline. Placing a
point by hand switches it to **manual**, and nothing moves it again until you
reset it.

Captions are drawn over the frame but outside the zoom transform — a caption
belongs to the viewer, not to the picture, so it does not slide or grow when
the camera moves. **From clicks** drafts one cue per click out of the element
text the extension already recorded; that is string formatting, not AI.

**Cutting.** Press `T` to drop a cut at the playhead, then drag its edges;
`I` and `O` cut everything before or after the playhead. Cut spans are shaded
across every lane, playback jumps over them, and they are gone from the export
— video and audio both.

Cuts are the one place timeline time and source time come apart. The edit list
in `packages/core/src/edits.ts` owns that conversion, and the rule that keeps
it cheap is that **everything else stays in source time**: zoom keyframes,
captions, the cursor path and the event log are never remapped. The exporter
walks edited time, maps each frame back through `editedToSource()`, and
composites at a source timestamp exactly as the preview does.

The timeline has a scrubbable ruler with amber marks at every logged click, a
cut lane, a zoom lane, a caption lane, and a clip lane. **Ctrl+Scroll** zooms the view
about the pointer, **Shift+Scroll** pans, and the window follows the playhead.

| Key | |
| --- | --- |
| `Space` | play / pause |
| `Z` | add a zoom at the playhead |
| `C` | add a caption at the playhead |
| `N` | add a narration line at the playhead |
| `S` | save the project |
| `T` | cut a section out at the playhead |
| `I` `O` | cut everything before / after the playhead |
| `Delete` | remove the selection |
| `Esc` | deselect |
| `←` `→` | step one frame (hold `Shift` for a second) |
| `Home` `End` | jump to start / end |

Wallpapers are generated, not shipped — a base colour plus soft radial blobs,
painted by one function used for both the picker swatch and the full frame, so
the swatch cannot lie and there are no binary assets in the repo.

## Narration

A **script** is a list of lines, each anchored to a source timestamp on the
same clock as everything else. **From clicks** drafts one per step out of the
element text already in the log — no AI, no transcript — and you edit the words
from there. **Generate voiceover** speaks every line that has changed, measures
how long it actually took, and lays the results onto one track.

The mixdown plays in the preview (the captured tab audio stays muted there) and
is muxed into the export with the recording ducked underneath the voice.

A few things follow from how it is wired:

- **Audio is never saved.** A project file holds the words; speech is
  regenerated from them. That keeps a project a few kilobytes instead of
  megabytes of base64, and means editing a line invalidates only that line.
- **The mixdown is in source time**, so cuts splice it through the exact same
  filter as the tab audio. Nothing in the narration path knows what a cut is.
- **A line's length is its speech**, not something you drag. Until it has been
  spoken the timeline uses a word-count estimate, marked `est.`. If lines start
  talking over each other the panel says so and offers to space them out.
- **Providers live behind one endpoint.** `GET /api/tts` says who can speak
  and with which voices; `POST /api/tts` returns WAV
  (`apps/editor/vite-tts.ts`). The panel renders whatever the server reports,
  so adding a provider is a server-side change. The mixdown, the timeline and
  the exporter never learn who spoke.
- **Different providers take different dials.** espeak-ng takes words per
  minute; Gemini takes a **director's note** — free text describing tone, pace
  and accent, handed to the model alongside the line. The panel shows only the
  dials the chosen provider actually uses, and switching provider or note
  re-speaks the affected lines.
- **Gemini returns raw PCM** (`audio/L16;rate=24000`), so the WAV header is
  written server-side before the audio ever reaches the browser.
- **"Available" means a key is configured**, not that it works — a bad key
  surfaces as the provider's own error the first time you generate.

## Saving: the project file

**Save project** (or `S`) writes `<name>.dfp.json` — the recording plus every
edit, as plain readable JSON. Drop it back in with the video to carry on. A raw
`demo.json` still opens too; it just gets freshly planned zooms.

The schema lives in `packages/core/src/project.ts`, not in the editor, because
the point is that the editor is not the only thing that can write one. A
script, a CI job, or Claude Code can open a project, change the zooms or
captions, write it back, and the editor will render exactly that.

```jsonc
{
  "format": "demoforge-project",
  "version": 1,
  "mediaName": "recording.webm",       // referenced, not embedded
  "recording": { /* the DemoRecording from capture */ },
  "zooms": [
    { "tStart": 1500, "tEnd": 3700, "targetXNorm": 0.42, "targetYNorm": 0.31,
      "scale": 1.8, "easing": "easeInOutCubic", "focus": "auto" }
  ],
  "captions": [
    { "tStart": 2000, "tEnd": 4200, "text": "Click \"Add Widget\"" }
  ],
  "script": [                          // narration; text only, audio is regenerated
    { "tStart": 800, "text": "Start by clicking Add Widget.", "audioMs": 2100 }
  ],
  "style": { "background": { "kind": "wallpaper", "id": "cobalt" }, "aspect": null,
             "padding": 0.05, "radius": 0.02, "shadow": { "blur": 0.05, "y": 0.018, "alpha": 0.5 },
             "cursor": { "show": true, "size": 0.045, "smoothing": 0.4, "clicks": true },
             "captions": { "size": 0.045, "position": "bottom", "color": "#ffffff",
                           "background": "rgba(2,6,23,0.72)" },
             "voice": { "provider": "local", "voice": "en-us+f3", "rate": 170,
                        "direction": "", "gain": 1, "duck": 0.25 } }
}
```

Notes for anything editing one by hand:

- `zooms` and `captions` are **time-ordered**, so "the third zoom" is stable.
  Neither list may overlap itself.
- All coordinates are **0..1**, all style lengths are **fractions of the
  output's shorter side**. No pixels anywhere.
- `focus: "auto"` means the zoom is aimed at the nearest click and will re-aim
  if moved; `"manual"` pins it.
- `parseProject()` is a trust boundary: it sorts and de-overlaps the lists,
  clamps every number into range, drops zero-length spans, and falls back to
  defaults rather than letting `NaN` reach the renderer. It throws only on a
  missing recording or a format version it does not understand — so a
  roughly-right file loads rather than failing.
- `cuts` are spans of source video the demo skips, in source time. They are
  sorted, clamped, merged when they overlap, and dropped when shorter than
  100 ms. A legacy `trim: {startMs, endMs}` (a span to *keep*) is migrated
  into the equivalent head and tail cuts.
- `script` lines carry `audioMs` only as a cached measurement. Change `text`
  and drop it — a stale length lays the timeline out for audio that no longer
  exists. Lines may overlap; that is reported, not prevented.
- `style.voice.duck` is what the captured recording drops to while the voice
  is talking, `gain` is the voice's own level.
- `style.voice.provider` is `"local"` or `"gemini"`; `voice` is that
  provider's own id (`en-us+f3`, `Iapetus`). `rate` is used by the local
  provider, `direction` by Gemini — both are always stored, so switching
  provider and back keeps your settings.
- Omitting `zooms`, `captions`, `cuts`, `script` or `style` entirely is fine;
  they default.

## The architecture contract

Everything flows through one type, `DemoRecording`, defined once in
`packages/core`. The rules that make Phase 1's editor reusable unchanged in
Phase 2 (AI voiceover) and Phase 3 (Playwright re-record):

- **Nothing downstream reads `source`.** Not the planner, editor, compositor or
  exporter. That branch is the seam that would break Phase 3.
- **Stored coordinates are normalised 0..1.** Pixels appear at exactly one
  place, `render/geometry.ts`, against the video's real decoded size.
- **One clock.** `t0` is stamped at `MediaRecorder.start()`; every
  `DemoEvent.t` is ms since it. The editor reconciles against the decoded
  duration on import and warns on drift over 100 ms.
- **The editor draws its own cursor** from the click log and never depends on a
  captured OS cursor — which is what makes Phase 3 work for free.
- **Audio is a separate track**, muxed at export, never an input to zoom logic.

## Verifying it

```sh
./scripts/make-fixture.sh          # markers at exactly known coordinates
pnpm -C apps/editor dev            # drop fixture/demo.json + recording.webm
```

Every zoom must land dead centre on its marker; the double-click at 5.0/5.12 s
must produce one zoom, and the giant panel at 13 s none. `pnpm -r test` asserts
all of that headlessly.

For recording-side timing, see `apps/extension/README.md`.

## Known ceilings

- **Velocity continuity at zoom seams.** Chained zooms are position-continuous,
  but the ease curve's velocity still steps at a ramp boundary, which can read
  as a small jerk. A spring chasing the eased target is the fix if it shows.
- **ffmpeg.wasm export** holds every frame in memory until the encode runs.
  Fine for a 30 s demo; a server-side render is the upgrade path.
- **Pill handles** stay inside the pill, so a very short zoom is fiddly to grab.
- **Voice providers are dev-server only**, so a statically built editor has
  none. Fine while this is a tool you run with `pnpm dev`; the fix is the same
  backend the Phase 2 TODO already calls for.
- **Ducking is a constant**, not a sidechain compressor — right when the tab
  audio is ambience, wrong if it ever carries something worth hearing.
