// Ephemeral presence over y-websocket awareness: live cursors, the avatar
// stack, peers' in-progress strokes/shapes, and the server-published room
// expiry. None of this is persisted — it lives only as long as the socket.

import { awareness, type Stroke, type Shape } from './sync';
import {
  w2s,
  s2w,
  onWorldDraw,
  onPostRender,
  drawStroke,
  drawShape,
  requestRender,
} from './canvas';

const PALETTE = ['#ff5a3c', '#3a8fff', '#6dbf8a', '#ffd84d', '#d091ff', '#ff8fb3'];
const THROTTLE_MS = 33; // ~30 awareness updates/sec while moving

type Draft = ({ kind: 'stroke' } & Stroke) | ({ kind: 'shape' } & Shape) | null;

interface PeerState {
  user?: { name: string; color: string };
  cursor?: { x: number; y: number } | null;
  draft?: Draft;
  server?: boolean;
  expiresAt?: number;
}

/** This client's stable color, derived from its awareness id. */
const myColor = PALETTE[awareness.clientID % PALETTE.length]!;
let myName = 'anon';

const presenceEl = document.getElementById('presence') as HTMLElement;

const cursorLayer = document.createElement('div');
cursorLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:90;';
document.body.appendChild(cursorLayer);
const cursorEls = new Map<number, HTMLElement>();

let peerDrafts: Draft[] = [];
let expiresAt = 0;
const peerCbs: Array<() => void> = [];

// --- public API ---------------------------------------------------------------

export function myUserColor(): string {
  return myColor;
}

/** This client's current display name (for the activity log). */
export function getMyName(): string {
  return myName;
}

/** Set this client's display name and publish it to peers. */
export function setUser(name: string): void {
  myName = name.trim() || 'anon';
  awareness.setLocalStateField('user', { name: myName, color: myColor });
}

/** Server-published room expiry (ms epoch); 0 until the first sync. */
export function getExpiresAt(): number {
  return expiresAt;
}

/** Count of other people currently in the room. */
export function peerCount(): number {
  let n = 0;
  for (const [id, st] of awareness.getStates() as Map<number, PeerState>) {
    if (!st.server && id !== awareness.clientID && st.user) n++;
  }
  return n;
}

/** Subscribe to presence changes (avatars / online count). */
export function onPeersChange(cb: () => void): void {
  peerCbs.push(cb);
}

// --- throttled outbound: cursor + draft --------------------------------------

let cursorPending: { x: number; y: number } | null = null;
let cursorTimer = 0;

function publishCursor(world: { x: number; y: number } | null): void {
  cursorPending = world;
  if (cursorTimer) return;
  cursorTimer = window.setTimeout(() => {
    cursorTimer = 0;
    awareness.setLocalStateField('cursor', cursorPending);
  }, THROTTLE_MS);
}

window.addEventListener('pointermove', (e) => {
  publishCursor(s2w({ x: e.clientX, y: e.clientY }));
});
window.addEventListener('pointerleave', () => publishCursor(null));

let draftPending: Draft = null;
let draftTimer = 0;

/** Stream (or clear) this client's in-progress stroke/shape to peers. */
export function setDraft(draft: Draft): void {
  if (draft === null) {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = 0;
    }
    draftPending = null;
    awareness.setLocalStateField('draft', null);
    return;
  }
  draftPending = draft;
  if (draftTimer) return;
  draftTimer = window.setTimeout(() => {
    draftTimer = 0;
    if (draftPending) awareness.setLocalStateField('draft', draftPending);
  }, THROTTLE_MS);
}

// --- inbound: render peers ----------------------------------------------------

function refresh(): void {
  const states = awareness.getStates() as Map<number, PeerState>;
  peerDrafts = [];
  const seen = new Set<number>();

  for (const [clientId, st] of states) {
    if (st.server) {
      if (typeof st.expiresAt === 'number') expiresAt = st.expiresAt;
      continue;
    }
    if (clientId === awareness.clientID || !st.user) continue;
    seen.add(clientId);

    if (st.cursor) {
      let el = cursorEls.get(clientId);
      if (!el) {
        el = makeCursorEl();
        cursorLayer.appendChild(el);
        cursorEls.set(clientId, el);
      }
      el.style.setProperty('--c', st.user.color);
      (el.querySelector('.pc-label') as HTMLElement).textContent = st.user.name;
      el.dataset.wx = String(st.cursor.x);
      el.dataset.wy = String(st.cursor.y);
    } else {
      cursorEls.get(clientId)?.remove();
      cursorEls.delete(clientId);
    }

    if (st.draft) peerDrafts.push(st.draft);
  }

  // Drop cursors for peers who left.
  for (const [id, el] of cursorEls) {
    if (!seen.has(id)) {
      el.remove();
      cursorEls.delete(id);
    }
  }

  positionCursors();
  renderAvatars(states);
  requestRender(); // repaint peer drafts
  for (const cb of peerCbs) cb();
}

function positionCursors(): void {
  for (const el of cursorEls.values()) {
    const s = w2s({ x: Number(el.dataset.wx), y: Number(el.dataset.wy) });
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }
}

function renderAvatars(states: Map<number, PeerState>): void {
  presenceEl.innerHTML = '';

  const me = document.createElement('div');
  me.className = 'avatar me';
  me.textContent = myName.slice(0, 2).toUpperCase();
  me.title = `${myName} (you)`;
  presenceEl.appendChild(me);

  for (const [id, st] of states) {
    if (st.server || id === awareness.clientID || !st.user) continue;
    const a = document.createElement('div');
    a.className = 'avatar';
    a.style.background = st.user.color;
    a.textContent = st.user.name.slice(0, 2).toUpperCase();
    a.title = st.user.name;
    presenceEl.appendChild(a);
  }
}

function makeCursorEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'peer-cursor';
  el.style.cssText = 'position:absolute;top:0;left:0;will-change:transform;';
  el.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" ' +
    'style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">' +
    '<path d="M2 2l5 12 2-5 5-2z" fill="var(--c,#fff)" ' +
    'stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>' +
    '<span class="pc-label" style="position:absolute;left:14px;top:12px;' +
    'background:var(--c,#fff);color:#111;font:500 10px/1 \'Geist Mono\',monospace;' +
    'padding:2px 5px;border-radius:3px;white-space:nowrap;">peer</span>';
  return el;
}

// Peers' in-progress strokes/shapes draw inside the world transform.
onWorldDraw((c) => {
  for (const draft of peerDrafts) {
    if (!draft) continue;
    if (draft.kind === 'stroke') drawStroke(draft, c);
    else drawShape(draft, c);
  }
});
onPostRender(positionCursors);

awareness.on('change', refresh);
