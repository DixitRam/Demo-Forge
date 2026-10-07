import { cp, mkdir, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const out = 'dist';

const common = {
  bundle: true,
  target: 'chrome116',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const builds = [
  // MV3 service worker is declared "type": "module".
  { ...common, entryPoints: { background: 'src/background.ts' }, outdir: out, format: 'esm' },
  { ...common, entryPoints: { offscreen: 'src/offscreen.ts' }, outdir: out, format: 'esm' },
  // Content scripts cannot be ES modules — must be a self-contained IIFE.
  { ...common, entryPoints: { content: 'src/content.ts' }, outdir: out, format: 'iife' },
  { ...common, entryPoints: { 'popup/popup': 'src/popup/popup.ts' }, outdir: out, format: 'iife' },
];

async function copyStatic() {
  await mkdir(`${out}/popup`, { recursive: true });
  await cp('manifest.json', `${out}/manifest.json`);
  await cp('icons', `${out}/icons`, { recursive: true });
  await cp('src/offscreen.html', `${out}/offscreen.html`);
  await cp('src/popup/popup.html', `${out}/popup/popup.html`);
  await cp('src/popup/popup.css', `${out}/popup/popup.css`);
}

await copyStatic();

if (watch) {
  for (const cfg of builds) (await esbuild.context(cfg)).watch();
  console.log('watching…');
} else {
  await Promise.all(builds.map((cfg) => esbuild.build(cfg)));
  console.log(`built -> ${out}`);
}
