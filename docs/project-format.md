# The project file

## Saving: the project file

**Save project** (or `S`) writes `<name>.dfp.json` — the recording plus every
edit (zooms, captions, cuts, the narration script and the style) as plain
readable JSON — and `<name>.narration.wav` alongside it when there is a
voiceover. Drop the JSON, the video, and the `.wav` back in to carry on
exactly where you were. A raw `demo.json` still opens too; it just gets
freshly planned zooms.

The schema lives in `packages/core/src/project.ts`, not in the editor, because
the point is that the editor is not the only thing that can write one. A
script, a CI job, or Claude Code can open a project, change the zooms or
captions, write it back, and the editor will render exactly that.

```jsonc
{
  "format": "demoforge-project",
  "version": 1,
  "mediaName": "recording.webm",       // referenced, not embedded
  "narrationName": "recording.narration.wav",   // ditto; "" when there is none
  "brief": "AirSense is an air-quality dashboard for facilities teams.",
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
- `brief` is what the demo is about, in your words. It is context for whoever
  writes the narration — the AI writer reads it — and it is worth keeping so
  the next rewrite starts from the same understanding.
- `narrationName` names the rendered voiceover sitting next to the project.
  The editor takes any dropped `.wav` as the narration, so the name is a hint
  rather than a requirement — files get renamed.
- `style.voice.provider` is `"local"`, `"gemini"`, `"elevenlabs"` or `"mistral"`;
  `voice` is that provider's own id (`en-us+f3`, `Iapetus`, or an ElevenLabs
  or Mistral voice id). `rate` is used by the local provider, `direction` by Gemini —
  both are always stored, so switching provider and back keeps your settings.
- Omitting `zooms`, `captions`, `cuts`, `script` or `style` entirely is fine;
  they default.
