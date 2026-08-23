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
  parseProject,
  planZooms,
  scriptFromSteps,
  scriptOverruns,
  scriptSteps,
  spaceOutScript,
} = core;

const DEFAULT_WPM = 170;
/** Wide enough for a model to read UI labels, small enough to hold many of. */
const FRAME_W = 720;

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

/** One JPEG per step, the clicked spot ringed so it is unambiguous. */
function grabFrames(dir, steps, outDir, height) {
  const src = video(dir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const step of steps) {
    // The opening is taken a beat in, past any page load; every other step at
    // the click itself, before the UI has responded.
    const at = step.action === 'open' ? Math.min(500, step.windowMs / 2) : step.tMs;
    const filters = [`scale=${FRAME_W}:-2`];
    if (step.xNorm !== undefined && step.yNorm !== undefined) {
      const size = 90;
      const x = Math.round(step.xNorm * FRAME_W - size / 2);
      const y = Math.round(step.yNorm * height - size / 2);
      filters.push(`drawbox=x=${x}:y=${y}:w=${size}:h=${size}:color=magenta@1.0:t=6`);
    }
    const out = join(outDir, `step-${String(step.index).padStart(2, '0')}.jpg`);
    execFileSync(
      'ffmpeg',
      ['-y', '-v', 'error', '-ss', String(at / 1000), '-i', src, '-frames:v', '1', '-vf', filters.join(','), out],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  }
}

function cmdSteps(dir) {
  const wpm = Number(arg('wpm', DEFAULT_WPM));
  const { rec, project } = load(dir);
  const steps = scriptSteps(rec, wpm);
  const outDir = resolve(arg('out', join(dir, 'frames')));
  const height = Math.round((FRAME_W / rec.video.width) * rec.video.height);

  grabFrames(dir, steps, outDir, height);

  const md = [
    `# Narration brief — ${basename(resolve(dir))}`,
    '',
    `${(rec.video.durationMs / 1000).toFixed(1)}s, ${rec.video.width}x${rec.video.height}, ` +
      `${rec.events.filter((e) => e.type === 'click').length} clicks, ${steps.length} steps at ${wpm} wpm.`,
    project?.brief ? `\nBrief on file: ${project.brief}` : '',
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
    '   That is the whole reason you get frames.',
    '5. Say why, not what. The viewer can see the click; they cannot see intent.',
    '6. Write the result as JSON: `[{"step": 0, "text": "..."}, ...]`',
    '7. Apply it: `node scripts/demoforge.mjs write <dir> --lines lines.json`',
    '',
    '## Steps',
    '',
  ];

  for (const s of steps) {
    const what =
      s.action === 'open'
        ? 'the opening frame, before anything happens'
        : `${s.action}${s.tag ? ` on a <${s.tag}>` : ''}${s.text ? ` labelled "${s.text}"` : ''}`;
    md.push(
      `### Step ${s.index} — ${stamp(s.tMs)}`,
      '',
      `- ${what}`,
      `- ${(s.windowMs / 1000).toFixed(1)}s until the next step: **at most ${s.maxWords} words**`,
      `- frame: \`${join(outDir, `step-${String(s.index).padStart(2, '0')}.jpg`)}\``,
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
  writeFileSync(projectPath, `${JSON.stringify(next, null, 2)}\n`);

  const overruns = scriptOverruns(script, rec.video.durationMs, wpm);
  for (const [i, line] of script.entries()) {
    const words = line.text.trim().split(/\s+/).length;
    process.stdout.write(
      `${stamp(line.tStart)}  ${String(words).padStart(2)}w  ` +
        `${overruns.includes(i) ? '!' : ' '} ${line.text}\n`,
    );
  }
  process.stdout.write(
    `\n${script.length} lines -> ${projectPath}\n` +
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
      '  write  --lines <file|-> --brief s  apply written lines to demo.dfp.json\n' +
      '  show                               summarise the project\n',
  );
}
const commands = { steps: cmdSteps, write: cmdWrite, show: cmdShow };
if (!commands[command]) die(`Unknown command: ${command}`);
commands[command](dir);
