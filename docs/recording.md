# Recording demos

## Agent-recorded demos

Tell Claude Code "record a demo of /login" and it does the rest. The
`demoforge` skill (`.claude/skills/demoforge/`, symlink it into
`~/.claude/skills/` to use it from any repo) has the agent read the page,
write `demos/<name>/flow.json` — Playwright actions with a `say` line of
narration on each — and run:

```sh
node scripts/demoforge.mjs record demos/<name>/flow.json   # video + demo.json + project with script
node scripts/demoforge.mjs steps  demos/<name>             # frames the agent checks
node scripts/demoforge.mjs open   demos/<name>             # editor at ?demo=<name>
```

The recorder paces itself to the narration: each line starts a beat before
its action and the step holds until the line has been said. `setup` steps
(signing in) run off camera. Capture is 2× device pixels, encoded as VP9 from the
screencast's own frames — Playwright's built-in recorder is capped at 1 Mbps. `${NAME}` in a flow is read from the environment
or `.env`, so credentials stay out of the file. The flow is the only file in a
take that is committed — re-recording after a UI change is the same command.

## Recording by hand (extension)

1. **Record.** `pnpm -C apps/extension build`, load `apps/extension/dist`
   unpacked in Chrome, open any `http(s)` page, click the DemoForge action →
   Start. It captures the tab with `chrome.tabCapture` and logs every click,
   input, scroll and navigation against the recorder's own clock.
2. **Stop.** Two files land in `~/Downloads/demoforge/<timestamp>/`:
   `recording.webm` and `demo.json` (a `DemoRecording`).
3. **Edit.** `pnpm -C apps/editor dev` and drop both into the editor. Zooms are
   planned from the click log; drag the pills to move or resize them, add and
   delete, restyle the frame.
4. **Export.** Render to MP4. With the dev server running this uses native
   ffmpeg (`apps/editor/vite-export.ts`): the recording is decoded straight
   through, each frame drawn by the editor's own `compose()` on a Skia canvas,
   and piped into x264 — an 86 s demo in about 2 minutes. Without a server it
   falls back to ffmpeg.wasm in the browser, several times slower.
