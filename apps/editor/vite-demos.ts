/**
 * Takes recorded by `demoforge record`, served to the editor: GET /api/demo/<name>
 * lists a take's files, GET /api/demo/<name>/<file> returns one. The editor
 * opened at `?demo=<name>` loads them as if they had been dropped in.
 *
 * Only `<repo>/demos/<name>/` is reachable, and only files the editor would
 * accept anyway. ponytail: dev-server only, same as the voice providers.
 */

import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const NAME = /^[\w.-]+$/;
const WANTED = /\.(json|webm|mp4|mkv|wav)$/i;
const TYPES: Record<string, string> = {
  json: 'application/json',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  wav: 'audio/wav',
};

export function demosPlugin(): Plugin {
  let root = '';
  return {
    name: 'demoforge-demos',
    configResolved(config) {
      root = resolve(config.root, '..', '..', 'demos');
    },
    configureServer(server) {
      server.middlewares.use('/api/demo', (req, res) => {
        const [name, file] = decodeURIComponent((req.url ?? '').split('?')[0]!).split('/').filter(Boolean);
        const dir = name && NAME.test(name) && name !== '..' ? join(root, name) : '';
        const ok = (f: string): boolean => NAME.test(f) && WANTED.test(f) && f !== 'flow.json';
        if (!dir || !existsSync(dir) || (file !== undefined && !ok(file))) {
          res.statusCode = 404;
          return res.end();
        }
        if (file === undefined) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(readdirSync(dir).filter(ok)));
        }
        const path = join(dir, file);
        if (!existsSync(path)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', TYPES[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
  };
}
