// Per-IP abuse limits, all in-memory. Three independent gates:
//   - at most LIMITS.roomsPerIp rooms joined at once
//   - at most LIMITS.newRoomsPerMinute brand-new rooms created per minute
//   - at most LIMITS.messagesPerSecond inbound WS messages per second
// State is pruned by sweepIps() so the Map cannot grow without bound.

import type { IncomingMessage } from 'node:http';
import { LIMITS } from '../shared/schema';

const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/**
 * Best-effort client IP. Behind Nginx + Cloudflare we trust the forwarded
 * headers; otherwise we fall back to the raw socket address.
 */
export function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export type Verdict = { ok: true } | { ok: false; reason: string };

interface IpState {
  /** Rooms this IP is in → socket count (one IP may have several tabs). */
  rooms: Map<string, number>;
  /** Timestamps of recent new-room creations, kept to a 60s window. */
  newRoomTimes: number[];
  /** Fixed 1-second window for the message-rate limit. */
  msgWindowStart: number;
  msgCount: number;
}

const ips = new Map<string, IpState>();

function stateFor(ip: string): IpState {
  let s = ips.get(ip);
  if (!s) {
    s = { rooms: new Map(), newRoomTimes: [], msgWindowStart: 0, msgCount: 0 };
    ips.set(ip, s);
  }
  return s;
}

/**
 * Gate a WebSocket upgrade. On success the room is recorded against the IP —
 * always pair a successful call with releaseRoom() when the socket closes.
 */
export function checkConnectionLimits(ip: string, room: string, isNewRoom: boolean): Verdict {
  const s = stateFor(ip);
  const alreadyIn = s.rooms.has(room);

  if (!alreadyIn && s.rooms.size >= LIMITS.roomsPerIp) {
    return { ok: false, reason: 'Too many rooms open from your connection.' };
  }

  if (isNewRoom && !alreadyIn) {
    const now = Date.now();
    s.newRoomTimes = s.newRoomTimes.filter((t) => now - t < 60_000);
    if (s.newRoomTimes.length >= LIMITS.newRoomsPerMinute) {
      return { ok: false, reason: 'Creating rooms too quickly — wait a minute.' };
    }
    s.newRoomTimes.push(now);
  }

  s.rooms.set(room, (s.rooms.get(room) ?? 0) + 1);
  return { ok: true };
}

/** Release one socket's hold on a room. */
export function releaseRoom(ip: string, room: string): void {
  const s = ips.get(ip);
  if (!s) return;
  const n = (s.rooms.get(room) ?? 0) - 1;
  if (n > 0) s.rooms.set(room, n);
  else s.rooms.delete(room);
}

/** Spend one message from this IP's per-second budget. false = over the cap. */
export function consumeMessageBudget(ip: string): boolean {
  const s = stateFor(ip);
  const now = Date.now();
  if (now - s.msgWindowStart >= 1_000) {
    s.msgWindowStart = now;
    s.msgCount = 0;
  }
  s.msgCount++;
  return s.msgCount <= LIMITS.messagesPerSecond;
}

/** Drop per-IP state that no longer holds anything. Called on a 60s interval. */
export function sweepIps(): void {
  const now = Date.now();
  for (const [ip, s] of ips) {
    s.newRoomTimes = s.newRoomTimes.filter((t) => now - t < 60_000);
    if (s.rooms.size === 0 && s.newRoomTimes.length === 0) {
      ips.delete(ip);
    }
  }
}
