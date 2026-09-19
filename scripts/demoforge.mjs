#!/usr/bin/env node
/**
 * DemoForge from the command line, for an agent that can look at pictures.
 *
 *   demoforge steps <recording-dir>     -> frames + a brief to read
 *   demoforge write <recording-dir>     -> apply the lines you wrote
 *   demoforge show  <recording-dir>     -> what the project holds now
 *
 * The point: the editor's "Write with AI" button pays a hosted model to look
 * at the screen. An agent driving this CLI *is* the model, so `steps` lays out
 * the frames and the word budgets, the agent reads them and writes the lines,
 * and `write` places them. No API key, no per-run cost, same pipeline.
 *
 * All the real logic — step planning, timing, budgets, spacing, the project
 * schema — comes from @demoforge/core, the same code the editor runs.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = new URL('../packages/core/dist/src/index.js', import.meta.url);
const core = await import(CORE.href).catch(() => {
  die('@demoforge/core is not built. Run: pnpm -C packages/core build');
});

const {
  DEFAULT_STYLE,
  createProject,
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

const [command, dir] = process.argv.slice(2);
if (!command || !dir || !existsSync(dir)) {
  die(
    'usage: demoforge <steps|write|show> <recording-dir> [options]\n' +
      '  steps  --out <dir> --wpm <n>       extract frames and a brief to read\n' +
      '  write  --lines <file|-> [--brief s] [--dry-run]\n' +
      '                                     apply written lines to demo.dfp.json;\n' +
      '                                     the brief changes only if --brief is given\n' +
      '  show                               summarise the project\n',
  );
}
const commands = { steps: cmdSteps, write: cmdWrite, show: cmdShow };
if (!commands[command]) die(`Unknown command: ${command}`);
commands[command](dir);
