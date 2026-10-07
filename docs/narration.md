# Narration and voices

## Voices

Narration needs a voice provider; nothing else does, and the editor tells you
which ones are available.

- **espeak-ng (local)** — free, offline, robotic.
- **Gemini AI** — copy `.env.example` to `.env` and put a key in
  `GEMINI_API_KEY`. The same key writes the script. Sounds like a person. `.env` at the repo root or in
  `apps/editor/` both work; the key is read by the dev server only and never
  reaches the browser.

  A free-tier key allows only a few requests a minute, so generating a long
  script pauses when the quota says to and picks up again — the button tells
  you how long it is waiting.
- **ElevenLabs** — `ELEVENLABS_API_KEY`, same two locations. The best voices.
  Metered per character: the free tier is 10,000 characters a month, personal
  use only, and asks you to credit ElevenLabs. The panel shows what is left
  and what the next generate will cost, and warns before a run that would run
  out partway.
- **Mistral Voxtral** — `MISTRAL_API_KEY`, same two locations.

## Narration

A **script** is a list of lines, each anchored to a source timestamp on the
same clock as everything else. There are two ways to get one.

**Write the script with AI** is the good one. The editor breaks the demo into
steps — an opening, then one per click — grabs a frame of the screen at each,
rings the spot that was clicked, and sends the lot to a model along with how
many seconds it has to talk at each step. It writes to that budget, naming
what is actually on screen. Give it a sentence about what the demo is for and
it gets markedly better; that brief is saved with the project.

Two things the model is deliberately not trusted with:

- **Timestamps.** It says which *step* a line belongs to; the editor decides
  when that lands. Asked for milliseconds, a model returns plausible ones, and
  plausible is not synchronised.
- **Length.** Each step carries a word budget from its own window. An
  over-long line is trimmed back to a sentence boundary, never mid-sentence —
  a line that runs a little long still reads, a truncated one does not.

Frames of your recording go to Google when you press it. Nothing else in the
editor sends anything anywhere.

**From clicks** is the offline fallback: one line per step from the element
text already in the log, string templates, no network. Rough, but instant.

**Generate voiceover** then speaks every line that has changed, measures how
long it actually took, and lays the results onto one track.

The mixdown plays in the preview (the captured tab audio stays muted there) and
is muxed into the export with the recording ducked underneath the voice.

A few things follow from how it is wired:

- **Audio is saved beside the project, not inside it.** **Save project**
  writes `<name>.dfp.json` and, when there is a voiceover,
  `<name>.narration.wav`. Drop both back in with the video and the narration
  plays immediately — nothing is respoken, which matters when the voice is
  metered. The JSON stays a few readable kilobytes rather than megabytes of
  base64, and the `.wav` is an ordinary file you can listen to or edit
  elsewhere.
- **A reloaded mixdown is sliced back into lines.** Each line knows its anchor
  and how long it ran, so the track is cut up and put back in the speech
  cache. Change one line of a reloaded project and only that line is spoken
  again. Drop the `.wav` and everything still works — it just costs a full
  regenerate.
- **The mixdown is in source time**, so cuts splice it through the exact same
  filter as the tab audio. Nothing in the narration path knows what a cut is.
- **Level is applied once, at the end.** The mixdown is at unity; the preview
  sets it on the audio element and the export sets it with a filter, so the
  two agree and moving the slider never forces a re-mix.
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
  and accent, handed to the model alongside the line; ElevenLabs takes neither
  and puts everything in the choice of voice. The panel shows only the dials
  the chosen provider actually uses, and switching provider or note re-speaks
  the affected lines.
- **Voice lists come from the provider.** ElevenLabs' are fetched live against
  your key, so your own cloned voices appear and no hardcoded id can go stale.
  Its availability means the key *works*, not just that one is set.
- **Both hosted providers return raw PCM** at 24 kHz — Gemini describes it in
  a mime type, ElevenLabs is asked for `pcm_24000` — so the WAV header is
  written server-side before the audio ever reaches the browser. (44.1 kHz
  from ElevenLabs needs a Pro subscription; 24 kHz does not.)
- **"Available" means a key is configured**, not that it works — a bad key
  surfaces as the provider's own error the first time you generate.
