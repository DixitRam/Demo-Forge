---
name: demoforge
description: Record a narrated DemoForge demo video of a page in a web app ("record a demo of /login", "make a demo for the data table") — write a Playwright flow with narration, record it, check the frames, and open it in the DemoForge editor for the user to review. Use whenever the user asks for a demo, walkthrough or tutorial video of their app and mentions DemoForge or doesn't name another recorder.
---

# Recording a demo with DemoForge

`$DF` is the root of the DemoForge checkout: the repo that contains this skill
at `.claude/skills/demoforge/` (so `$DF` is two levels above this file's folder;
when the skill is symlinked into `~/.claude/skills/`, resolve the link). Quote
it, since checkouts often live under paths with spaces. Everything
goes through its CLI, `node "$DF/scripts/demoforge.mjs"`. Takes live in
`$DF/demos/<name>/`; `flow.json` is the only file there you write by hand.

The loop: **understand the page → write flow.json → record → look at the frames
→ fix and re-record → open for review.** The user reviews in the editor; your
job is to hand them a take that is already right.

## 1. Understand the page

- Find where the app runs (dev server URL, e.g. `http://localhost:4200`). Check
  it answers with `curl`. If it isn't running and you can't tell how to start
  it, ask.
- Read the page's source (the route's component/template) so you know the
  real labels, what the page is for, and what a good 30–60 s story is: one
  goal, 4–8 actions, a clear ending. Not every button.
- Login-gated page? Find how to sign in. Credentials go in `$DF/.env` and are
  referenced as `${NAME}` in the flow — never write a password into flow.json.
  If there are no demo credentials, ask the user for them.

## 2. Write `$DF/demos/<name>/flow.json`

```json
{
  "url": "http://localhost:4200",
  "start": "/data-table",
  "viewport": [1440, 900],
  "brief": "One sentence: what the product is and what this demo shows.",
  "setup": [
    { "goto": "/login" },
    { "fill": "#email", "text": "${DEMO_EMAIL}" },
    { "fill": "#password", "text": "${DEMO_PASSWORD}" },
    { "click": "role=button[name='Sign in']" },
    { "waitFor": "text=Dashboard" }
  ],
  "steps": [
    { "wait": 500, "say": "Here's how to find a device fast in the data table." },
    { "fill": "[placeholder='Search']", "text": "roof", "say": "Search filters rows as you type." },
    { "click": "role=columnheader[name='Status']", "say": "Click a header to sort." },
    { "wait": 1000, "say": "That's the table — search, sort, done." }
  ]
}
```

- `setup` runs **off camera** (sign-in, seeding state). Then `start` is opened
  and recording begins. For a demo *of* the login page, put the login in
  `steps` and leave `setup` out.
- Actions (one per step): `goto` path · `click` sel · `fill` sel + `text`
  (clicks, then types visibly) · `select` sel + `value` · `press` key ·
  `hover` sel · `scroll` pixels or sel · `wait` ms · `waitFor` sel.
- Selectors are Playwright selector strings. Prefer what a user sees:
  `role=button[name='Save']`, `text=Export`, `[placeholder='Search']`, `#id`.
  They are strict — a selector matching two elements fails; narrow it.
- `say` is the narration for that step. It starts a beat **before** the
  action, and the recorder holds the step until the line has been said, so
  pacing follows the words. Keep lines short (≤ 15 words), say *why* not
  *what*, name the real on-screen labels, write it as spoken ("P M ten" not
  "PM10"). Open with a one-line intro on a `wait` step, close with one too.
- `pause` (ms) on a step overrides the default 900 ms hold after it.
- `viewport` is the page size in CSS px; it is captured at 2× (`"scale": 2`,
  the default) so zoomed-in text stays sharp. Leave both alone unless asked.

## 3. Record

```sh
node "$DF/scripts/demoforge.mjs" record "$DF/demos/<name>/flow.json"
```

Writes `recording.webm`, `demo.json` and `demo.dfp.json` (zooms planned from
the clicks, the `say` lines as the narration script) beside the flow. Add
`--headed` to watch. On failure it names the step and saves `failure.png` —
look at it, fix the selector or add a `waitFor`, re-run. A re-record replaces
the previous take's project.

## 4. Check the frames — do not skip

```sh
node "$DF/scripts/demoforge.mjs" steps "$DF/demos/<name>"
```

Then **Read** every `frames/step-*.jpg` (and `-zoom.jpg` close-ups). Confirm
each click hit what the narration says, no error toasts, spinners or empty
tables, nothing sensitive on screen. Fix the flow and re-record if not.

Optional: to rewrite the narration against the real frames without
re-recording, follow `frames/brief.md` (word budgets per step), then
`write "$DF/demos/<name>" --lines lines.json --dry-run` and again without
`--dry-run`. This re-times lines to the clicks.

## 5. Hand over

```sh
node "$DF/scripts/demoforge.mjs" open "$DF/demos/<name>"
```

Starts the editor if it isn't running and opens the take in the browser.
Tell the user: the URL, how long the demo is, the narration lines, anything
you weren't sure about. They pick a voice and press **Generate voiceover** in
the Script & voice panel, adjust zooms, then **Export**. Don't generate the
voiceover yourself — hosted voices are metered.
