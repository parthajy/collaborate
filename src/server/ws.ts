// The real-time sync layer. Implements the y-websocket wire protocol directly
// (two message types: SYNC and AWARENESS) so we control every hook — message
// rate limiting, awareness cleanup, keepalive — without forking a library.

import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import type { Room } from './rooms';
import { consumeMessageBudget } from './ratelimit';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_INTERVAL_MS = 30_000;

/** Rooms whose doc/awareness → all-conns broadcast handlers are attached. */
const wiredRooms = new WeakSet<Room>();

function send(room: Room, conn: WebSocket, data: Uint8Array): void {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(room, conn);
    return;
  }
  try {
    conn.send(data, (err) => {
      if (err) closeConn(room, conn);
    });
  } catch {
    closeConn(room, conn);
  }
}

function broadcast(room: Room, data: Uint8Array, except?: unknown): void {
  for (const conn of room.conns.keys()) {
    if (conn !== except) send(room, conn, data);
  }
}

function closeConn(room: Room, conn: WebSocket): void {
  const owned = room.conns.get(conn);
  if (owned !== undefined) {
    room.conns.delete(conn);
    // Clear this connection's cursors/presence for everyone else.
    awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
    room.touch();
  }
  try {
    conn.close();
  } catch {
    /* already closed */
  }
}

/** Attach a room's doc + awareness → all-connections broadcast handlers once. */
function wireRoom(room: Room): void {
  if (wiredRooms.has(room)) return;
  wiredRooms.add(room);

  // Any doc change (a peer's edit, or our cap-enforce trim) → fan out.
  room.doc.on('update', (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    // `origin` is the originating socket (or 'cap-enforce') — never echo back.
    broadcast(room, encoding.toUint8Array(enc), origin);
  });

  // Awareness change (cursor moved, name set, live ink) → fan out to everyone.
  room.awareness.on(
    'update',
    (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      // Track which awareness IDs each socket owns, for disconnect cleanup.
      if (origin instanceof WebSocket) {
        const owned = room.conns.get(origin);
        if (owned) {
          for (const id of changes.added) owned.add(id);
          for (const id of changes.removed) owned.delete(id);
        }
      }
      const ids = changes.added.concat(changes.updated, changes.removed);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids),
      );
      broadcast(room, encoding.toUint8Array(enc));
    },
  );
}

/** Wire a freshly-accepted WebSocket into a room's Yjs sync + awareness. */
export function setupConnection(room: Room, conn: WebSocket, ip: string): void {
  conn.binaryType = 'arraybuffer';
  wireRoom(room);
  room.conns.set(conn, new Set());
  room.touch();

  conn.on('message', (data) => {
    // Per-IP flood guard. Over budget → close the socket; the client will
    // reconnect and re-sync cleanly. (Dropping individual binary messages
    // would risk a silent CRDT desync.)
    if (!consumeMessageBudget(ip)) {
      closeConn(room, conn);
      return;
    }
    try {
      handleMessage(room, conn, new Uint8Array(data as ArrayBuffer));
    } catch (err) {
      console.error('[ws] bad message:', err);
      closeConn(room, conn);
    }
  });

  conn.on('close', () => closeConn(room, conn));
  conn.on('error', () => closeConn(room, conn));

  // Keepalive — drop sockets that stop responding to pings.
  let alive = true;
  conn.on('pong', () => {
    alive = true;
  });
  const ping = setInterval(() => {
    if (!room.conns.has(conn)) {
      clearInterval(ping);
      return;
    }
    if (!alive) {
      closeConn(room, conn);
      clearInterval(ping);
      return;
    }
    alive = false;
    try {
      conn.ping();
    } catch {
      closeConn(room, conn);
      clearInterval(ping);
    }
  }, PING_INTERVAL_MS);

  // Handshake: sync step 1, then a full awareness snapshot of the room.
  const syncEnc = encoding.createEncoder();
  encoding.writeVarUint(syncEnc, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEnc, room.doc);
  send(room, conn, encoding.toUint8Array(syncEnc));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const awEnc = encoding.createEncoder();
    encoding.writeVarUint(awEnc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awEnc,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
    );
    send(room, conn, encoding.toUint8Array(awEnc));
  }
}

function handleMessage(room: Room, conn: WebSocket, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MESSAGE_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // `conn` as transaction origin → the doc-update broadcaster skips sender.
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
      // readSyncMessage may produce a reply (e.g. sync step 2 on first sync).
      if (encoding.length(encoder) > 1) {
        send(room, conn, encoding.toUint8Array(encoder));
      }
      break;
    }
    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
    }
    default:
      break; // unknown message type — ignore
  }
}
