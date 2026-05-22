// Aggregate, individual-free counts for the landing page. No IPs, no names,
// no per-user data ever leaves here — only room names, head counts, and totals.

import { MARQUEE_MAX } from '../shared/schema';
import { allRooms } from './rooms';

export interface StatsPayload {
  /** Rooms with at least one person currently connected. */
  rooms: number;
  /** Total people connected across all rooms. */
  users: number;
  /** Busiest rooms, for the landing-page marquee. */
  list: { name: string; users: number }[];
}

export function statsPayload(): StatsPayload {
  const active = [...allRooms()].filter((r) => r.size > 0);
  return {
    rooms: active.length,
    users: active.reduce((sum, r) => sum + r.size, 0),
    list: active
      .map((r) => ({ name: r.name, users: r.size }))
      .sort((a, b) => b.users - a.users)
      .slice(0, MARQUEE_MAX),
  };
}
