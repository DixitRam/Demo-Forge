# Architecture

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
- **Native export is one process, one frame at a time** (~1.5x real time at
  2880x1800). Splitting the timeline across worker threads is the next step
  if that matters. The ffmpeg.wasm fallback still holds every frame in memory.
- **Pill handles** stay inside the pill, so a very short zoom is fiddly to grab.
- **Voice providers are dev-server only**, so a statically built editor has
  none. Fine while this is a tool you run with `pnpm dev`; the fix is the same
  backend the Phase 2 TODO already calls for.
- **Ducking is a constant**, not a sidechain compressor — right when the tab
  audio is ambience, wrong if it ever carries something worth hearing.
