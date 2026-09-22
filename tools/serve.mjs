#!/usr/bin/env node
/**
 * Zero-dependency static file server for the RouteDots showcase.
 *
 * Serves the repository root so that `examples/showcase/index.html` can load
 * the IIFE bundle at `../../dist/routedots.browser.global.js`.
 *
 * Usage:
 *   node tools/serve.mjs [port]
 *
 * The port defaults to 5173. Pass a port as the first argument (or set $PORT)
 * to override.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? process.env.PORT ?? 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function decodePath(raw) {
  // `new URL(...).pathname` strips the query string for us.
  return decodeURIComponent(new URL(raw, 'http://localhost').pathname);
}

const server = createServer(async (req, res) => {
  const fail = (status, body) => {
    if (!res.headersSent) res.writeHead(status).end(body);
    else res.destroy();
  };

  let urlPath;
  try {
    urlPath = decodePath(req.url ?? '/');
  } catch {
    fail(400, 'Bad request');
    return;
  }

  // Landing on the bare root? Send visitors straight to the showcase.
  if (urlPath === '/') {
    res.writeHead(302, { Location: '/examples/showcase/' });
    res.end();
    return;
  }

  // Resolve the requested file, refusing to escape the repository root.
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    fail(403, 'Forbidden');
    return;
  }

  try {
    let target = filePath;
    let stat = await fs.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      stat = await fs.stat(target);
    }
    if (!stat.isFile()) throw new Error('not a file');

    const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
    const stream = createReadStream(target);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    fail(404, 'Not found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`RouteDots showcase: http://localhost:${port}/examples/showcase/`);
});
