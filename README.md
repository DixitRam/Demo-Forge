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
pnpm -r test                  # 66 tests
pnpm -C apps/extension build  # then load apps/extension/dist unpacked in Chrome
pnpm -C apps/editor dev
```

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

An icon rail on the right opens five panels:

| Panel | What it does |
| --- | --- |
| Background | Image / Colour / Gradient tabs — 18 generated wallpapers, custom upload, gradient presets with editable stops and angle |
| Zoom | Auto-zoom toggle, per-zoom or global scale, re-plan from the click log |
| Effects | Padding, corner radius, shadow blur / offset / strength |
| Layout | Output aspect — Original, 16:9, 9:16, 1:1, 4:3, 4:5 |
| Cursor | Show, click pulse, size, smoothing |

The timeline has a scrubbable ruler with amber marks at every logged click, a
zoom lane of draggable pills, and a clip lane. **Ctrl+Scroll** zooms the view
about the pointer, **Shift+Scroll** pans, and the window follows the playhead.

| Key | |
| --- | --- |
| `Space` | play / pause |
| `Z` | add a zoom at the playhead |
| `Delete` | remove the selected zoom |
| `←` `→` | step one frame (hold `Shift` for a second) |
| `Home` `End` | jump to start / end |

Wallpapers are generated, not shipped — a base colour plus soft radial blobs,
painted by one function used for both the picker swatch and the full frame, so
the swatch cannot lie and there are no binary assets in the repo.

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
