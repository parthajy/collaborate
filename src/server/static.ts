// Minimal static-file serving from public/. In production Nginx serves these
// directly; this stays as a dev convenience and a fallback. All paths are
// confined to PUBLIC_DIR — directory traversal cannot escape it.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const PUBLIC_DIR = resolve(process.cwd(), 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Serve a file from public/. Returns true if it produced the response,
 * false if the file does not exist (caller then handles routing / 404).
 *
 * HTML and the app bundle (.js) are served `no-cache` so a rebuild or deploy
 * always takes effect on the next load. An ETag keeps that cheap — unchanged
 * files revalidate to a 304 instead of re-downloading.
 */
export async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  relPath: string,
): Promise<boolean> {
  const abs = resolve(PUBLIC_DIR, '.' + normalize('/' + relPath));
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + '/')) return false;

  let size: number;
  let mtimeMs: number;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return false;
    size = s.size;
    mtimeMs = s.mtimeMs;
  } catch {
    return false;
  }

  const ext = extname(abs).toLowerCase();
  // HTML and the JS bundle must re-validate every load; static media may sit
  // in cache. Cloudflare layers its own edge caching on top.
  const mustRevalidate = ext === '.html' || ext === '.js';
  const cacheControl = mustRevalidate ? 'no-cache' : 'public, max-age=86400';
  const etag = `W/"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': size,
    ETag: etag,
    'Cache-Control': cacheControl,
  });

  if ((req.method ?? 'GET') === 'HEAD') {
    res.end();
  } else {
    createReadStream(abs).pipe(res);
  }
  return true;
}
