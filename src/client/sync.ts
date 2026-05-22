// The sync foundation: one Yjs document per room, a WebSocket provider, an
// awareness channel for ephemeral presence, and a local-only undo manager.
// Every other client module reads its shared state from here.

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';
import { DOC } from '../shared/schema';

export { Y };

export interface Point {
  x: number;
  y: number;
}

/** A finished pen/marker/eraser stroke — immutable once committed. */
export interface Stroke {
  id: string;
  tool: 'pen' | 'marker' | 'eraser';
  color: string;
  size: number;
  points: Point[];
  /** Stable id of the client that drew it. */
  by?: string;
}

/** A vector shape. Movable, resizable, and recolorable via the selection panel. */
export interface Shape {
  id: string;
  type: 'rect' | 'ellipse' | 'line' | 'arrow';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  size: number;
  /** Fill color for rect/ellipse; absent = unfilled. Ignored by line/arrow. */
  fill?: string;
  /** Paint order — higher draws on top. */
  z?: number;
  /** Stable id of the client that created it. */
  by?: string;
}

export type ObjType = 'text' | 'sticky' | 'flowcard' | 'image' | 'video' | 'link';

/** A connector between two artifacts (objects or shapes), referenced by id. */
export interface Edge {
  id: string;
  from: string;
  to: string;
  color: string;
  /** Optional relationship label, drawn at the connector's midpoint. */
  label?: string;
  /** Stable id of the client that created it. */
  by?: string;
}

/** One entry in the room activity log. */
export interface LogEntry {
  /** Timestamp (ms epoch). */
  t: number;
  /** Display name of who did it, snapshotted at the time. */
  name: string;
  /** What happened, e.g. "added a sticky note". */
  text: string;
}

/** The room name is the URL path: collaborate.so/<word>. */
export const roomName: string =
  decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '')) || 'untitled';

/** Origin tag for local edits — lets the undo manager undo only our own work. */
export const LOCAL_ORIGIN = Symbol('local');

export const doc = new Y.Doc();

/** Ordered — paint order matters, since the eraser draws over earlier strokes. */
export const yStrokes = doc.getArray<Stroke>(DOC.strokes);
/** Keyed by id; values are plain immutable objects. */
export const yShapes = doc.getMap<Shape>(DOC.shapes);
/** Keyed by id; each value is a nested Y.Map (so a drag mutates one field). */
export const yObjects = doc.getMap<Y.Map<unknown>>(DOC.objects);
/** Connectors, keyed by id. */
export const yEdges = doc.getMap<Edge>(DOC.edges);
/** Capped room activity log. */
export const yLog = doc.getArray<LogEntry>(DOC.log);

/** Run a mutation as a single local, undoable transaction. */
export function transact(fn: () => void): void {
  doc.transact(fn, LOCAL_ORIGIN);
}

/** Undo manager — tracks only locally-originated edits across all three types. */
export const undoManager = new Y.UndoManager([yStrokes, yShapes, yObjects, yEdges], {
  trackedOrigins: new Set([LOCAL_ORIGIN]),
  captureTimeout: 350,
});

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
export const provider = new WebsocketProvider(
  `${wsProtocol}://${location.host}`,
  roomName,
  doc,
);
export const awareness: Awareness = provider.awareness;

/** Short, collision-resistant id for strokes / shapes / objects. */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * A stable per-browser id — identifies "who made" an artifact, so a creator
 * can delete their own work. Persisted in localStorage; falls back to a
 * per-session id when storage is blocked.
 */
export const clientUid: string = (() => {
  try {
    let id = localStorage.getItem('cs.uid');
    if (!id) {
      id = 'u-' + genId() + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('cs.uid', id);
    }
    return id;
  } catch {
    return 'u-' + genId() + Math.random().toString(36).slice(2, 6);
  }
})();

/** Total CRDT items in the room — mirrors the server-side object cap. */
export function itemCount(): number {
  return yStrokes.length + yShapes.size + yObjects.size + yEdges.size;
}

// --- connection state ---------------------------------------------------------

type StatusCb = (status: 'connecting' | 'connected' | 'disconnected') => void;
type RefusedCb = (reason: string) => void;

const statusCbs: StatusCb[] = [];
let refusedCb: RefusedCb | null = null;

/** Subscribe to connection status changes (drives the welcome footer). */
export function onStatus(cb: StatusCb): void {
  statusCbs.push(cb);
}

/** Called once if the server hard-refuses the room (blocked name / rate limit). */
export function onConnectionRefused(cb: RefusedCb): void {
  refusedCb = cb;
}

provider.on('status', (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
  for (const cb of statusCbs) cb(event.status);
});

provider.on('connection-close', (event: { code: number; reason: string } | null) => {
  // App-private close codes (4000–4999) are hard refusals from our server.
  if (event && event.code >= 4000 && event.code < 5000) {
    provider.shouldConnect = false;
    provider.disconnect();
    refusedCb?.(event.reason || 'This room is not available.');
  }
});

// --- initial sync -------------------------------------------------------------

const syncedCbs: Array<() => void> = [];
let hasSynced = false;

/** Run `cb` once the room's initial state has synced (immediately if already). */
export function onSynced(cb: () => void): void {
  if (hasSynced) cb();
  else syncedCbs.push(cb);
}

provider.on('sync', (isSynced: boolean) => {
  if (isSynced && !hasSynced) {
    hasSynced = true;
    for (const cb of syncedCbs) cb();
    syncedCbs.length = 0;
  }
});
