// Process entry point: one HTTP server that serves static files, answers
// /healthz and /stats, and upgrades WebSocket connections into rooms.
// Single process, single droplet — no clustering, no external services.

import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { LIMITS, ROOM_NAME_RE, RESERVED_PATHS } from '../shared/schema';
import { getRoom, peekRoom, roomCount, totalConnections, sweepRooms } from './rooms';
import { setupConnection } from './ws';
import { serveFile } from './static';
import { clientIp, checkConnectionLimits, releaseRoom, sweepIps } from './ratelimit';
import { validateRoomName } from './blocklist';
import { statsPayload } from './stats';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const PRODUCTION = process.env.NODE_ENV === 'production';

/** Extract a room name from a URL path, trimming slashes. */
function roomNameFromPath(pathname: string): string {
  return decodeURIComponent(pathname).replace(/^\/+/, '').replace(/\/+$/, '');
}

/** True for a bare `/<word>` path that should serve the room canvas. */
function isRoomRoute(seg: string): boolean {
  return (
    seg.length > 0 &&
    seg.length <= LIMITS.roomNameMaxLen &&
    !seg.includes('/') &&
    ROOM_NAME_RE.test(seg) &&
    !RESERVED_PATHS.has(seg)
  );
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

  // Health check — used by Docker, Nginx, and uptime monitors.
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        status: 'ok',
        rooms: roomCount(),
        users: totalConnections(),
        uptime: Math.round(process.uptime()),
      }),
    );
    return;
  }

  // Aggregate, individual-free stats for the landing page.
  if (pathname === '/stats') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=5', // short cache absorbs polling
    });
    res.end(JSON.stringify(statsPayload()));
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  // Static files + room routing.
  if (pathname === '/') {
    if (await serveFile(req, res, 'landing.html')) return;
  } else {
    const rel = pathname.slice(1);
    if (await serveFile(req, res, rel)) return;
    // Not a real file — a bare `/<word>` serves the room canvas.
    if (isRoomRoute(rel) && (await serveFile(req, res, 'room.html'))) return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 — not found');
});

// ---------------------------------------------------------------------------
// WebSocket upgrades — one connection per room
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true, maxPayload: 5 * 1024 * 1024 });

server.on('upgrade', (req: IncomingMessage, socket, head) => {
  const roomName = roomNameFromPath(new URL(req.url ?? '/', 'http://localhost').pathname);
  const ip = clientIp(req);

  const name = validateRoomName(roomName);
  const isNew = peekRoom(roomName) === undefined;
  // Only run the connection-limit check (which has side effects) once the
  // name itself is valid.
  const gate = name.ok ? checkConnectionLimits(ip, roomName, isNew) : name;

  wss.handleUpgrade(req, socket, head, (ws) => {
    // Reject after the handshake with an app-private close code (4000–4999)
    // so the browser client can read the reason and stop retrying.
    if (!name.ok) {
      ws.close(4403, name.reason);
      return;
    }
    if (!gate.ok) {
      ws.close(4429, gate.reason);
      return;
    }
    const room = getRoom(roomName);
    setupConnection(room, ws, ip);
    ws.once('close', () => releaseRoom(ip, roomName));
  });
});

// ---------------------------------------------------------------------------
// Maintenance — 24h TTL sweep + per-IP state cleanup
// ---------------------------------------------------------------------------
const sweeper = setInterval(() => {
  sweepRooms();
  sweepIps();
}, 60_000);
sweeper.unref();

server.listen(PORT, HOST, () => {
  console.log(
    `collaborate.so — listening on http://${HOST}:${PORT} ` +
      `(${PRODUCTION ? 'production' : 'development'})`,
  );
});

// Graceful shutdown — stop accepting, let in-flight requests drain.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}
