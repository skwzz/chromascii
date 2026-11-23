#!/usr/bin/env node
/**
 * Zero-dependency local static server for CHROMASCII
 * Usage: node serve.mjs [port]
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 3001);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const rel = normalize(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = resolve(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[CHROMASCII] Running at http://localhost:${PORT}`);
});
