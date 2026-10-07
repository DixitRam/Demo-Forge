#!/usr/bin/env node
/**
 * DemoForge from the command line, for an agent that can look at pictures.
 *
 *   demoforge steps <recording-dir>     -> frames + a brief to read
 *   demoforge write <recording-dir>     -> apply the lines you wrote
 *   demoforge show  <recording-dir>     -> what the project holds now
 *   demoforge record <flow.json>        -> drive the app, capture a narrated take
 *   demoforge open  <recording-dir>     -> load it in the editor for review
 *
 * The point: the editor's "Write with AI" button pays a hosted model to look
 * at the screen. An agent driving this CLI *is* the model, so `steps` lays out
 * the frames and the word budgets, the agent reads them and writes the lines,
 * and `write` places them. No API key, no per-run cost, same pipeline.
 *
 * All the real logic — step planning, timing, budgets, spacing, the project
 * schema — comes from @demoforge/core, the same code the editor runs.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = new URL('../packages/core/dist/src/index.js', import.meta.url);
const core = await import(CORE.href).catch(() => {
  die('@demoforge/core is not built. Run: pnpm -C packages/core build');
});

const {
  DEFAULT_DRAFT,
  DEFAULT_STYLE,
  MIN_LINE_GAP_MS,
  createProject,
  estimateSpeechMs,
  fitToBudget,
  lineDuration,
  pageRect,
  parseProject,
  planZooms,
  scriptFromSteps,
  scriptOverruns,
  scriptSteps,
  spaceOutScript,
} = core;

const DEFAULT_WPM = 170;
/** Full frames stay near native: dashboard labels are 12-14px and die when shrunk. */
const FRAME_MAX_W = 1920;
/** The close-up is this fraction of the screen, at native pixels, centred on the click. */
const CROP = 1 / 3;
/** Tags whose recorded text is a dump of their children, not a label. */
const UNLABELLED = new Set(['form', 'body', 'main', 'svg', 'g', 'rect', 'path', 'canvas']);

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function stamp(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function load(dir) {
  const projectPath = join(dir, 'demo.dfp.json');
  const recPath = join(dir, 'demo.json');

  // An existing project is the source of truth: rewriting the script must not
  // throw away zooms, cuts or captions someone already made.
  if (existsSync(projectPath)) {
    const project = parseProject(JSON.parse(readFileSync(projectPath, 'utf8')));
    return { project, rec: project.recording, projectPath };
  }
  if (!existsSync(recPath)) die(`No demo.json or demo.dfp.json in ${dir}`);
  return { project: null, rec: JSON.parse(readFileSync(recPath, 'utf8')), projectPath };
}

function video(dir) {
  for (const name of ['recording.webm', 'recording.mp4', 'recording.mkv']) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return die(`No recording.webm in ${dir}`);
}

const frameName = (i, suffix = '') => `step-${String(i).padStart(2, '0')}${suffix}.jpg`;

/**
 * Per step: the whole screen, plus a native-resolution close-up of the click
 * so small labels stay readable. Everything is in ffmpeg expressions against
 * the real stream size, so a demo.json whose declared size is off can't
 * misplace the ring.
 */
function grabFrames(dir, rec, steps, outDir) {
  const src = video(dir);
  // Cut tabCapture's letterbox off first: click coordinates are relative to the page.
  const p = pageRect(rec.viewport, rec.video.width, rec.video.height);
  const page = `crop=${Math.round(p.w)}:${Math.round(p.h)}:${Math.round(p.x)}:${Math.round(p.y)}`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const step of steps) {
    // The opening is taken a beat in, past any page load; every other step at
    // the click itself, before the UI has responded.
    const at = step.action === 'open' ? Math.min(500, step.windowMs / 2) : step.tMs;
    const full = join(outDir, frameName(step.index));
    const scale = `scale='min(${FRAME_MAX_W},iw)':-2`;
    const input = ['-y', '-v', 'error', '-ss', String(at / 1000), '-i', src];
    const opts = { stdio: ['ignore', 'ignore', 'pipe'] };

    if (step.xNorm === undefined || step.yNorm === undefined) {
      execFileSync('ffmpeg', [...input, '-frames:v', '1', '-q:v', '3', '-vf', `${page},${scale}`, full], opts);
      continue;
    }
    // A thin ring, ~3% of the width: marks the spot without hiding its neighbours.
    const { xNorm: x, yNorm: y } = step;
    const ring =
      `drawbox=x=iw*${x}-iw*0.015:y=ih*${y}-iw*0.015:w=iw*0.03:h=iw*0.03:color=magenta@1.0:t=3`;
    const crop =
      `crop=w=iw*${CROP}:h=ih*${CROP}` +
      `:x='clip(iw*${x}-ow/2,0,iw-ow)':y='clip(ih*${y}-oh/2,0,ih-oh)'`;
    execFileSync(
      'ffmpeg',
      [
        ...input,
        '-filter_complex', `[0:v]${page},${ring},split[a][b];[a]${scale}[full];[b]${crop}[zoom]`,
        '-map', '[full]', '-frames:v', '1', '-q:v', '3', full,
        '-map', '[zoom]', '-frames:v', '1', '-q:v', '2', join(outDir, frameName(step.index, '-zoom')),
      ],
      opts,
    );
  }
}

function cmdSteps(dir) {
  const wpm = Number(arg('wpm', DEFAULT_WPM));
  const { rec, project } = load(dir);
  const steps = scriptSteps(rec, wpm);
  const outDir = resolve(arg('out', join(dir, 'frames')));
  grabFrames(dir, rec, steps, outDir);

  const md = [
    `# Narration brief — ${basename(resolve(dir))}`,
    '',
    `${(rec.video.durationMs / 1000).toFixed(1)}s, ${rec.video.width}x${rec.video.height}, ` +
      `${rec.events.filter((e) => e.type === 'click').length} clicks, ${steps.length} steps at ${wpm} wpm.`,
    project?.brief
      ? `\nBrief on file (written by a previous writer — unverified, check it against the frames): ${project.brief}`
      : '',
    '',
    'Frames come from `recording.webm`. Ignore any `demo.mp4` beside it: that is a',
    'rendered export with cuts and zooms applied, so its times and positions do not match.',
    '',
    '## How to use this',
    '',
    '1. Look at every frame below (they are real files — open them).',
    '2. Write one line per step, AT MOST. Skip a step if there is nothing worth',
    '   saying; silence beats filler.',
    '3. Stay inside each step\'s word budget. It is the words that physically fit',
    '   before the next thing happens. Over-long lines get pushed later, which',
    '   drags the narration out of sync with the picture.',
    '4. Name what is actually on screen — the real field, panel and button names.',
    '   That is the whole reason you get frames. Each click also has a',
    '   native-resolution close-up (`-zoom.jpg`) for reading small text.',
    '5. Say why, not what. The viewer can see the click; they cannot see intent.',
    '6. Write it as it is spoken: "P M ten", not "PM10". Budgets count spoken',
    '   words, so an expansion spends budget.',
    '7. Write the result as JSON: `[{"step": 0, "text": "..."}, ...]`',
    '8. Check it: `node scripts/demoforge.mjs write <dir> --lines lines.json --dry-run`,',
    '   then run again without `--dry-run` to save.',
    '',
    '## Steps',
    '',
  ];

  for (const s of steps) {
    const what =
      s.action === 'open'
        ? 'the opening frame, before anything happens'
        : UNLABELLED.has(s.tag)
          ? `${s.action} on a <${s.tag}> — no usable label recorded, read the close-up`
          : `${s.action}${s.tag ? ` on a <${s.tag}>` : ''}${s.text ? ` labelled "${s.text}"` : ''}`;
    const hasZoom = s.xNorm !== undefined && s.yNorm !== undefined;
    md.push(
      `### Step ${s.index} — ${stamp(s.tMs)}`,
      '',
      `- ${what}`,
      `- ${(s.windowMs / 1000).toFixed(1)}s until the next step: **at most ${s.maxWords} words**`,
      `- frame: \`${join(outDir, frameName(s.index))}\``,
      ...(hasZoom ? [`- close-up: \`${join(outDir, frameName(s.index, '-zoom'))}\``] : []),
      '',
    );
  }

  const mdPath = join(outDir, 'brief.md');
  writeFileSync(mdPath, md.join('\n'));
  writeFileSync(join(outDir, 'steps.json'), `${JSON.stringify(steps, null, 2)}\n`);

  process.stdout.write(
    `${steps.length} steps, ${steps.length} frames -> ${outDir}\n` +
      `Read ${mdPath}, then write lines.json and run:\n` +
      `  node scripts/demoforge.mjs write ${dir} --lines lines.json\n`,
  );
}

function cmdWrite(dir) {
  const wpm = Number(arg('wpm', DEFAULT_WPM));
  const linesArg = arg('lines');
  if (!linesArg) die('Pass --lines <file.json> (or --lines - to read stdin).');

  const raw = linesArg === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(linesArg), 'utf8');
  let written;
  try {
    written = JSON.parse(raw);
  } catch {
    die('--lines must be JSON: [{"step": 0, "text": "..."}]');
  }
  if (!Array.isArray(written)) die('--lines must be a JSON array.');

  const { rec, project, projectPath } = load(dir);
  const steps = scriptSteps(rec, wpm);
  const budget = new Map(steps.map((s) => [s.index, s.maxWords]));

  const clean = [];
  for (const l of written) {
    if (typeof l?.step !== 'number' || typeof l?.text !== 'string') continue;
    const max = budget.get(l.step);
    if (max === undefined) {
      process.stderr.write(`warning: no step ${l.step}, line dropped\n`);
      continue;
    }
    const text = fitToBudget(l.text, max);
    if (text) clean.push({ step: l.step, text });
  }
  if (clean.length === 0) die('Nothing usable in --lines.');

  const script = spaceOutScript(scriptFromSteps(steps, clean), wpm);
  const brief = arg('brief', project?.brief ?? '');

  const next = createProject(rec, project?.mediaName ?? basename(video(dir)), {
    zooms: project?.zooms?.length ? project.zooms : planZooms(rec),
    captions: project?.captions ?? [],
    cuts: project?.cuts ?? [],
    script,
    brief,
    narrationName: project?.narrationName ?? '',
    style: project?.style ?? DEFAULT_STYLE,
  });
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun) writeFileSync(projectPath, `${JSON.stringify(next, null, 2)}\n`);

  const overruns = scriptOverruns(script, rec.video.durationMs, wpm);
  for (const [i, line] of script.entries()) {
    const words = line.text.trim().split(/\s+/).length;
    process.stdout.write(
      `${stamp(line.tStart)}  ${String(words).padStart(2)}w  ` +
        `${overruns.includes(i) ? '!' : ' '} ${line.text}\n`,
    );
  }
  process.stdout.write(
    `\n${script.length} lines ${dryRun ? '(dry run, nothing saved)' : `-> ${projectPath}`}\n` +
      (overruns.length
        ? `${overruns.length} line(s) marked ! run into the next one; shorten them.\n`
        : 'No overruns.\n'),
  );
}

function cmdShow(dir) {
  const { rec, project } = load(dir);
  if (!project) return process.stdout.write(`${dir}: raw recording, no project yet.\n`);
  process.stdout.write(
    `${project.mediaName} — ${(rec.video.durationMs / 1000).toFixed(1)}s\n` +
      `zooms ${project.zooms.length} · captions ${project.captions.length} · ` +
      `cuts ${project.cuts.length} · script ${project.script.length}\n` +
      `narration ${project.narrationName || '(none)'}\n` +
      (project.brief ? `brief: ${project.brief}\n` : '') +
      project.script
        .map((l) => `  ${stamp(l.tStart)}  ${l.text}`)
        .join('\n') +
      '\n',
  );
}

// --- record: an agent-written flow, driven by Playwright ---------------------

const REPO = fileURLToPath(new URL('..', import.meta.url));
/** Hold after an action that has nothing said over it. */
const PACE_MS = 900;
/**
 * Pacing assumes a slower voice than the editor's 170 wpm, so a real voice
 * finishes inside the hold instead of running into the next action.
 */
const PACE_WPM = 150;
/** Visible typing speed, ms per key. */
const TYPE_DELAY_MS = 45;
/** Let the last frame breathe before the video ends. */
const TAIL_MS = 1500;

/** Everything about the thing an action touches that the log records. */
async function touch(loc) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error('element has no box (hidden?)');
  const el = await loc.evaluate((e) => {
    // Same walk-up as the extension's describeElement: label the control, not its inner span.
    const t = e.closest('button,a,input,select,textarea,label,summary,[role],[onclick],[tabindex]') ?? e;
    const r = t.getBoundingClientRect();
    const text = (t.textContent || t.getAttribute('aria-label') || t.labels?.[0]?.textContent || t.getAttribute('placeholder') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 60);
    return { tag: t.tagName.toLowerCase(), ...(text ? { text } : {}), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, el };
}

/** One flow step. `log` is a no-op during setup, which is not recorded. */
async function act(page, step, log) {
  const vp = page.viewportSize();
  const at = async (loc, type) => {
    const { x, y, el } = await touch(loc);
    log({ type, xNorm: x / vp.width, yNorm: y / vp.height, el });
    return loc;
  };
  if ('goto' in step) {
    await page.goto(step.goto);
    log({ type: 'nav', xNorm: 0, yNorm: 0 });
  } else if ('click' in step) {
    await (await at(page.locator(step.click), 'click')).click();
  } else if ('fill' in step) {
    const loc = await at(page.locator(step.fill), 'click');
    await loc.click();
    await loc.fill('');
    await loc.pressSequentially(String(step.text ?? ''), { delay: TYPE_DELAY_MS });
  } else if ('select' in step) {
    await (await at(page.locator(step.select), 'click')).selectOption(step.value);
  } else if ('press' in step) {
    await page.keyboard.press(step.press);
  } else if ('hover' in step) {
    await (await at(page.locator(step.hover), 'move')).hover();
  } else if ('circle' in step) {
    // Loop the pointer around an element to draw the eye, the way a presenter
    // does. Logged as moves; the editor's cursor glides through them.
    const loc = page.locator(step.circle);
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (!box) throw new Error('element has no box (hidden?)');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rx = Math.min(box.width / 2 + 14, 160);
    const ry = Math.min(box.height / 2 + 10, 90);
    const n = 16;
    const ms = step.ms ?? 1400;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI / 2 + (2 * Math.PI * k) / n;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      await page.mouse.move(x, y);
      log({ type: 'move', xNorm: x / vp.width, yNorm: y / vp.height });
      if (k < n) await page.waitForTimeout(ms / n);
    }
  } else if ('scroll' in step) {
    if (typeof step.scroll === 'number') await page.mouse.wheel(0, step.scroll);
    else await page.locator(step.scroll).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300); // let smooth scrolling land before reading it
    const yNorm = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      return max > 0 ? scrollY / max : 0;
    });
    log({ type: 'scroll', xNorm: 0.5, yNorm });
  } else if ('wait' in step) {
    await page.waitForTimeout(step.wait);
  } else if ('waitFor' in step) {
    await page.locator(step.waitFor).waitFor();
  } else {
    throw new Error('unknown action');
  }
}

/**
 * Frames arrive only when the page changes, each stamped on the same wall
 * clock as t0, so each one is held until the next: video time 0 is t0 and the
 * log lines up by construction.
 */
function encodeFrames(frames, t0, end, out) {
  if (frames.length === 0) die('The screencast produced no frames.');
  const list = frames.map((f, i) => {
    const from = i === 0 ? t0 : f.ts;
    const to = frames[i + 1]?.ts ?? end;
    return `file '${f.file}'\nduration ${(Math.max(1, to - from) / 1000).toFixed(4)}`;
  });
  // The concat demuxer ignores the last entry's duration unless it is repeated.
  list.push(`file '${frames.at(-1).file}'`);
  const listPath = join(dirname(frames[0].file), 'list.txt');
  writeFileSync(listPath, `${list.join('\n')}\n`);
  execFileSync(
    'ffmpeg',
    [
      '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-fps_mode', 'cfr', '-r', '30',
      // ponytail: crf 28 is sharp for UI at 2x; lower it if text still looks soft.
      '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
      // A keyframe a second. The editor's exporter seeks to every frame, and a
      // seek decodes forward from the last keyframe: libvpx's default spacing
      // (~4 s) made that 204 ms a frame at 2880x1800, this makes it 65 ms.
      '-g', '30',
      '-pix_fmt', 'yuv420p', out,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

async function cmdRecord(flowPath) {
  // `${NAME}` in a flow reads the environment (or the repo's .env), so
  // passwords never have to be written into a file that gets committed.
  try {
    process.loadEnvFile(join(REPO, '.env'));
  } catch {}
  let flow;
  try {
    flow = JSON.parse(
      readFileSync(flowPath, 'utf8').replace(/\$\{(\w+)\}/g, (_, k) =>
        k in process.env ? JSON.stringify(process.env[k]).slice(1, -1) : die(`${flowPath}: \${${k}} is not set`),
      ),
    );
  } catch (e) {
    die(`${flowPath}: ${e.message}`);
  }
  if (typeof flow.url !== 'string' || !Array.isArray(flow.steps)) die('A flow needs "url" and "steps".');
  // The take lands beside its flow, so re-recording is the same command again.
  const outDir = dirname(resolve(flowPath));
  const [w, h] = flow.viewport ?? [1440, 900];
  const scale = flow.scale ?? 2;

  const { chromium } = await import('playwright-core');
  // Full Chromium, not the headless shell, and the scale forced on the whole
  // browser: without both, screencast frames come at CSS size whatever the
  // page's deviceScaleFactor, and a 1.8x zoom stretches 1x pixels into mush.
  const browser = await chromium
    .launch({
      channel: 'chromium',
      headless: !process.argv.includes('--headed'),
      args: [`--force-device-scale-factor=${scale}`],
    })
    .catch((e) => die(`${e.message}\nIf the browser is missing: pnpm exec playwright-core install chromium`));
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: scale,
    baseURL: flow.url,
  });
  page.setDefaultTimeout(10_000); // a wrong selector should fail fast, not after 30 s
  const events = [];
  const script = [];
  const frameDir = join(outDir, '.frames');
  const frames = [];
  let t0 = null;
  let current = 'setup';
  const log = (ev) => t0 !== null && events.push({ t: Date.now() - t0, ...ev });

  try {
    // Setup (logging in, seeding state) happens off camera, on the same page.
    for (const [i, step] of (flow.setup ?? []).entries()) {
      current = `setup[${i}] ${JSON.stringify(step)}`;
      await act(page, step, log);
    }
    current = `start ${flow.start ?? '/'}`;
    await page.goto(flow.start ?? '/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Frames go to disk as JPEGs with their capture time, and we encode them
    // ourselves: Playwright's own recorder is VP8 at a fixed 1 Mbps, which
    // smears small UI text. Frames only arrive when the page changes.
    rmSync(frameDir, { recursive: true, force: true });
    mkdirSync(frameDir, { recursive: true });
    await page.screencast.start({
      size: { width: w * scale, height: h * scale },
      quality: 92,
      onFrame: ({ data, timestamp }) => {
        const file = join(frameDir, `${frames.length}.jpg`);
        writeFileSync(file, data);
        frames.push({ file, ts: timestamp });
      },
    });
    t0 = Date.now();
    for (const [i, step] of flow.steps.entries()) {
      current = `steps[${i}] ${JSON.stringify(step)}`;
      const start = Date.now();
      const say = typeof step.say === 'string' ? step.say.trim() : '';
      if (say) {
        script.push({ tStart: start - t0, text: say });
        // Speak first, act a beat later — the same lead the editor's drafts use.
        if (!('wait' in step)) await page.waitForTimeout(DEFAULT_DRAFT.leadMs);
      }
      await act(page, step, log);
      // Hold until the line is said, and never rush on to the next action.
      const until = Math.max(
        Date.now() + (step.pause ?? PACE_MS),
        say ? start + estimateSpeechMs(say, PACE_WPM) + MIN_LINE_GAP_MS : 0,
      );
      await page.waitForTimeout(until - Date.now());
    }
    await page.waitForTimeout(TAIL_MS);
  } catch (e) {
    await page.screenshot({ path: join(outDir, 'failure.png') }).catch(() => {});
    if (t0 !== null) await page.screencast.stop().catch(() => {});
    await browser.close();
    rmSync(frameDir, { recursive: true, force: true });
    die(`${current} failed:\n${e.message.split('\n').slice(0, 6).join('\n')}\nPage at failure: ${join(outDir, 'failure.png')}`);
  }
  const end = Date.now();
  await page.screencast.stop();
  await browser.close();
  encodeFrames(frames.filter((f) => f.ts <= end), t0, end, join(outDir, 'recording.webm'));
  rmSync(frameDir, { recursive: true, force: true });
  // Stamp the length the encoder actually produced, or the editor's drift
  // guard rescales every event and pulls the clicks out of sync.
  const durationMs = Math.round(
    Number(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(outDir, 'recording.webm')])
        .toString(),
    ) * 1000,
  );
  rmSync(join(outDir, 'failure.png'), { force: true });

  const rec = {
    source: 'playwright',
    createdAt: new Date(Date.now() - durationMs).toISOString(),
    video: { durationMs, width: w * scale, height: h * scale, mime: 'video/webm' },
    viewport: { w, h, dpr: scale },
    events,
  };
  writeFileSync(join(outDir, 'demo.json'), `${JSON.stringify(rec, null, 2)}\n`);
  const project = createProject(rec, 'recording.webm', {
    zooms: planZooms(rec),
    script: spaceOutScript(script, DEFAULT_WPM),
    brief: flow.brief ?? '',
    style: DEFAULT_STYLE,
  });
  // A fresh take replaces the old project: its zooms and cuts were for other footage.
  writeFileSync(join(outDir, 'demo.dfp.json'), `${JSON.stringify(project, null, 2)}\n`);
  rmSync(join(outDir, 'demo.narration.wav'), { force: true });

  process.stdout.write(
    `${(durationMs / 1000).toFixed(1)}s, ${events.filter((e) => e.type === 'click').length} clicks, ` +
      `${project.zooms.length} zooms, ${script.length} lines -> ${outDir}\n` +
      `Check the frames:  node scripts/demoforge.mjs steps ${outDir}\n` +
      `Open for review:   node scripts/demoforge.mjs open ${outDir}\n`,
  );
}

// --- open: hand the take to the editor ---------------------------------------

async function editorUrl(name) {
  for (const port of [5173, 5174, 5175]) {
    const ok = await fetch(`http://localhost:${port}/api/demo/${name}`).then((r) => r.ok, () => false);
    if (ok) return `http://localhost:${port}`;
  }
  // Nothing of ours is running: start the editor, detached, and read its URL from the log.
  const logPath = join(REPO, 'demos', '.editor.log');
  const child = spawn(join(REPO, 'apps/editor/node_modules/.bin/vite'), ['--configLoader', 'runner'], {
    cwd: join(REPO, 'apps/editor'),
    detached: true,
    stdio: ['ignore', openSync(logPath, 'w'), openSync(logPath, 'a')],
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    // Vite colours its banner; strip the escapes before looking for the URL.
    const m = readFileSync(logPath, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').match(/Local:\s+(http:\/\/localhost:\d+)/);
    if (m) return m[1];
  }
  return die(`The editor did not start; see ${logPath}`);
}

/**
 * The editor's Export button, from the terminal: posts the saved project to
 * the dev server's native exporter (apps/editor/vite-export.ts), so the MP4
 * is byte-for-byte what the editor would make from the same project.
 */
async function cmdExport(dir) {
  const { project, rec } = load(dir);
  if (!project) die(`${dir} has no demo.dfp.json yet.`);
  const media = readFileSync(video(dir));
  const narPath = join(dir, project.narrationName || 'demo.narration.wav');
  const narration = existsSync(narPath) ? readFileSync(narPath) : Buffer.alloc(0);
  const fps = Number(arg('fps', 30));
  const header = Buffer.from(
    JSON.stringify({
      rec,
      keyframes: project.zooms,
      captions: project.captions,
      cuts: project.cuts,
      style: project.style,
      fps,
      mediaBytes: media.length,
      narrationBytes: narration.length,
    }),
  );
  const len = Buffer.alloc(4);
  len.writeUInt32LE(header.length);

  const base = await editorUrl(basename(resolve(dir)));
  const out = resolve(arg('out', join(dir, 'demo.mp4')));
  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  const res = await fetch(`${base}/api/export`, { method: 'POST', body: Buffer.concat([len, header, media, narration]) });
  if (!res.ok) die(`Export server returned ${res.status}.`);

  let buf = '';
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const msg = JSON.parse(line);
      if (msg.error) die(`\n${msg.error}`);
      if (msg.stage) process.stdout.write(`\r${msg.stage} ${Math.round(msg.ratio * 100)}%  ${secs()}s   `);
      if (msg.done) {
        const file = await fetch(`${base}/api/export/${msg.done}`);
        writeFileSync(out, Buffer.from(await file.arrayBuffer()));
        const len = (project.recording.video.durationMs / 1000).toFixed(1);
        process.stdout.write(
          `\n${out}\n${len}s of demo in ${secs()}s at ${fps} fps${narration.length ? ', with narration' : ''}\n`,
        );
        return;
      }
    }
  }
  die('\nThe export server closed the connection early.');
}

async function cmdOpen(dir) {
  const abs = resolve(dir);
  if (dirname(abs) !== join(REPO, 'demos')) die(`open serves takes from ${join(REPO, 'demos')}/<name> only.`);
  if (!existsSync(join(abs, 'demo.dfp.json')) && !existsSync(join(abs, 'demo.json'))) die(`Nothing recorded in ${abs}`);
  const url = `${await editorUrl(basename(abs))}/?demo=${encodeURIComponent(basename(abs))}`;
  if (!process.argv.includes('--no-browser')) spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  process.stdout.write(`${url}\n`);
}

const [command, dir] = process.argv.slice(2);
if (!command || !dir || !existsSync(dir)) {
  die(
    'usage: demoforge <record|open|export|steps|write|show> <recording-dir> [options]\n' +
      '  record <demos/name/flow.json> [--headed]\n' +
      '                                     run the flow, capture video + log + script beside it\n' +
      '  open   [--no-browser]              load the take in the editor (starts it if needed)\n' +
      '  export [--out file.mp4] [--fps n]  render the MP4 exactly as the editor would, timed\n' +
      '  steps  --out <dir> --wpm <n>       extract frames and a brief to read\n' +
      '  write  --lines <file|-> [--brief s] [--dry-run]\n' +
      '                                     apply written lines to demo.dfp.json;\n' +
      '                                     the brief changes only if --brief is given\n' +
      '  show                               summarise the project\n',
  );
}
const commands = { record: cmdRecord, open: cmdOpen, export: cmdExport, steps: cmdSteps, write: cmdWrite, show: cmdShow };
if (!commands[command]) die(`Unknown command: ${command}`);
await commands[command](dir);
