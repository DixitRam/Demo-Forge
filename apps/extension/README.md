# @demoforge/extension

MV3 Chrome extension, written from scratch, MIT. Captures a tab plus a
structured click log and downloads them as a `DemoRecording` bundle.

## Build & load

```sh
pnpm -C apps/extension build     # or `dev` to watch
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `apps/extension/dist`.

## Recording

Open any `http(s)` page, click the DemoForge action, **Start recording**. The
badge shows `REC` and the popup counts events live. **Stop & download** writes
two files into `~/Downloads/demoforge/<timestamp>/`:

- `recording.webm` — the captured tab (VP9, audio track if the tab had one)
- `demo.json` — the `DemoRecording`

## Verifying the timing (correctness risk #1)

```sh
python3 -m http.server 8000 --directory apps/extension/verify
# then record http://localhost:8000/timing-check.html
```

Every click flashes the page white for ~90 ms. Afterwards, scrub
`recording.webm` to each flash and compare the player timestamp against the
matching `t` in `demo.json` — they must agree within ~100 ms. The giant panel
must produce no zoom keyframe (it covers >60% of the viewport).

## Notes

- **tabCapture, not getDisplayMedia** — see the comment at the top of
  `src/recorder.ts`. One clean tab, no OS cursor, no source picker; the editor
  draws its own cursor from the click log.
- Chrome cannot inject content scripts into `chrome://` pages or the Web Store,
  so recording is limited to `http(s)` pages.
- Audio is captured when the tab has any, and re-routed to the speakers so you
  can still hear what you are demoing. There is deliberately no audio UI.
