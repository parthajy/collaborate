// Shared constants — the single source of truth imported by BOTH the server
// bundle and the client bundle. Keep this file free of any Node- or DOM-specific
// APIs so it stays safe to bundle into either side.

/**
 * Top-level shared-type keys inside each room's Yjs document.
 *
 *   strokes  Y.Array<Stroke>            ordered — paint order matters (eraser
 *                                       draws over earlier strokes)
 *   shapes   Y.Map<string, Shape>       keyed by id; immutable after creation
 *   objects  Y.Map<string, Y.Map>       keyed by id; each value is a nested
 *                                       Y.Map so a drag mutates one field.
 *                                       Its `text` field is a Y.Text, giving
 *                                       character-level merge on sticky/text/flow.
 */
export const DOC = {
  strokes: 'strokes',
  shapes: 'shapes',
  objects: 'objects',
  /** Y.Map<string, Edge> — connectors between artifacts, keyed by id. */
  edges: 'edges',
  /** Y.Array<LogEntry> — capped room activity log. */
  log: 'log',
} as const;

/** Abuse-prevention and resource limits. */
export const LIMITS = {
  /** Max items (strokes + shapes + objects) a single room may hold. */
  objectsPerRoom: 5_000,
  /** Max new rooms one IP may create per minute. */
  newRoomsPerMinute: 5,
  /** Max inbound WebSocket messages per second, per IP. */
  messagesPerSecond: 200,
  /** Max rooms one IP may be joined to at once. */
  roomsPerIp: 5,
  /** Room time-to-live after it goes quiet (no connections, no edits): 24h. */
  roomTtlMs: 24 * 60 * 60 * 1_000,
  /** Max characters in a room name. */
  roomNameMaxLen: 32,
} as const;

/** The landing-page marquee lists at most this many active rooms. */
export const MARQUEE_MAX = 30;

/**
 * A valid room-name slug: lowercase alphanumerics joined by single hyphens.
 * Disallows leading/trailing/doubled hyphens. Length is checked separately
 * against `LIMITS.roomNameMaxLen`.
 */
export const ROOM_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL paths that can never be a room name (would collide with real routes). */
export const RESERVED_PATHS: ReadonlySet<string> = new Set([
  'healthz',
  'stats',
  'vendor',
  'index.html',
  'landing.html',
  'room.html',
  'changelog',
  'changelog.html',
  'favicon.ico',
  'robots.txt',
  '.well-known',
]);
