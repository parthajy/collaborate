// In-memory room registry. One Y.Doc + one Awareness per room, held in a Map.
// No database, no Redis — rooms are ephemeral, and a process restart losing
// open rooms is acceptable (and rare). The 24h TTL sweeper frees memory.

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import { DOC, LIMITS } from '../shared/schema';
import { enforceObjectCap } from './caps';

export class Room {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  /** Each connected socket → the awareness client-IDs it controls. */
  readonly conns = new Map<WebSocket, Set<number>>();
  /** Timestamp of the last edit or connection change — drives the 24h TTL. */
  lastActivity = Date.now();

  constructor(name: string) {
    this.name = name;
    this.doc = new Y.Doc();
    // Materialize the shared types up front so they always exist.
    this.doc.getArray(DOC.strokes);
    this.doc.getMap(DOC.shapes);
    this.doc.getMap(DOC.objects);
    this.doc.getMap(DOC.edges);
    this.doc.getArray(DOC.log);

    this.awareness = new Awareness(this.doc);
    // The server occupies one awareness slot — not a user, but a carrier for
    // the room's expiry time, which clients read to drive the TTL clock.
    this.refreshExpiry();

    this.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      this.lastActivity = Date.now();
      // Skip our own trim transaction to avoid re-entrancy.
      if (origin !== 'cap-enforce') enforceObjectCap(this);
    });
  }

  get size(): number {
    return this.conns.size;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Publish the room's expiry time into awareness as a non-user "server" state.
   * While anyone is connected the room cannot expire, so expiry is pinned 24h
   * out; once empty it counts down for real from the last activity.
   */
  refreshExpiry(): void {
    const base = this.conns.size > 0 ? Date.now() : this.lastActivity;
    this.awareness.setLocalState({ server: true, expiresAt: base + LIMITS.roomTtlMs });
  }

  /** Total CRDT items — feeds the per-room object cap and /stats. */
  itemCount(): number {
    return (
      this.doc.getArray(DOC.strokes).length +
      this.doc.getMap(DOC.shapes).size +
      this.doc.getMap(DOC.objects).size +
      this.doc.getMap(DOC.edges).size
    );
  }

  destroy(): void {
    this.awareness.destroy();
    this.doc.destroy();
  }
}

const rooms = new Map<string, Room>();

/** Get an existing room, creating it on first access. */
export function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    room = new Room(name);
    rooms.set(name, room);
  }
  return room;
}

/** Look up a room without creating it. */
export function peekRoom(name: string): Room | undefined {
  return rooms.get(name);
}

export function allRooms(): IterableIterator<Room> {
  return rooms.values();
}

export function roomCount(): number {
  return rooms.size;
}

export function totalConnections(): number {
  let n = 0;
  for (const room of rooms.values()) n += room.conns.size;
  return n;
}

/**
 * One TTL pass: destroy rooms that are empty AND have been quiet longer than
 * the 24h TTL. While anyone is connected `conns.size > 0`, a room never expires.
 * Called on a 60s interval from index.ts.
 */
export function sweepRooms(): void {
  const now = Date.now();
  for (const [name, room] of rooms) {
    room.refreshExpiry();
    if (room.conns.size === 0 && now - room.lastActivity > LIMITS.roomTtlMs) {
      room.destroy();
      rooms.delete(name);
    }
  }
}
