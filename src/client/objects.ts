// DOM objects: text, sticky notes, flow nodes, images, videos, link cards.
// Each object is a nested Y.Map in `yObjects`; editable ones carry a Y.Text
// for true character-level merge. The Yjs observer is the single code path
// that mounts/unmounts DOM — local creation just writes to Yjs.

import { LIMITS } from '../shared/schema';
import { Y, yObjects, transact, genId, itemCount, clientUid, type ObjType } from './sync';
import { view, w2s, s2w, requestRender } from './canvas';
import { state } from './state';
import { toast } from './toast';
import { select } from './selection';
import { logEvent } from './log';

interface LiveObj {
  id: string;
  type: ObjType;
  el: HTMLElement;
  ymap: Y.Map<unknown>;
  dispose: () => void;
}

const objectLayer = document.getElementById('objectLayer') as HTMLElement;
const live = new Map<string, LiveObj>();
let interactive = true;

const STICKY_COLORS = ['#ffd84d', '#ff8fb3', '#6dbf8a', '#a4d4f5', '#ffb380', '#d4ff3a'];
let stickyIdx = 0;

/** Wire the Yjs → DOM observer and the per-frame repositioning. */
export function initObjects(onPostRender: (fn: () => void) => void): void {
  for (const [id] of yObjects) mount(id);

  yObjects.observe((event) => {
    for (const [id, change] of event.changes.keys) {
      if (change.action === 'add') mount(id);
      else if (change.action === 'delete') unmount(id);
    }
  });

  // Pan/zoom moves every object — reposition them after each canvas paint.
  onPostRender(() => {
    for (const rec of live.values()) position(rec);
  });
}

/** Toggle object pointer interaction — off while a drawing tool is active. */
export function setObjectsInteractive(on: boolean): void {
  interactive = on;
  for (const rec of live.values()) {
    rec.el.style.pointerEvents = on ? 'auto' : 'none';
  }
}

// --- creation (local) ---------------------------------------------------------

function roomIsFull(): boolean {
  if (itemCount() >= LIMITS.objectsPerRoom) {
    toast(`room is full - ${LIMITS.objectsPerRoom.toLocaleString()} item limit`);
    return true;
  }
  return false;
}

function nextZ(): number {
  let max = 0;
  for (const m of yObjects.values()) {
    const z = m.get('z');
    if (typeof z === 'number' && z > max) max = z;
  }
  return max + 1;
}

/** Human-readable name for an object type, used in the activity log. */
function objectLabel(type: string): string {
  if (type === 'flowcard') return 'flow node';
  if (type === 'sticky') return 'sticky note';
  return type || 'object';
}

/** Create an object: integrate an empty Y.Map, then let `build` fill it. */
function create(build: (m: Y.Map<unknown>) => void): string {
  const id = genId();
  let type = '';
  transact(() => {
    const m = new Y.Map<unknown>();
    yObjects.set(id, m); // integrate first, so nested Y.Text can be added
    build(m);
    m.set('z', nextZ());
    m.set('by', clientUid); // stamp the creator
    type = (m.get('type') as string) ?? '';
  });
  logEvent('added a ' + objectLabel(type));
  return id;
}

/** Focus a freshly-created editable object so the creator can type at once. */
function focusNew(id: string): void {
  const rec = live.get(id);
  if (rec) setTimeout(() => rec.el.focus(), 20);
}

export function addText(x: number, y: number): void {
  if (roomIsFull()) return;
  const id = create((m) => {
    m.set('type', 'text');
    m.set('x', x);
    m.set('y', y);
    m.set('color', state.color);
    m.set('text', new Y.Text('Type here'));
  });
  focusNew(id);
}

export function addSticky(x: number, y: number): void {
  if (roomIsFull()) return;
  const id = create((m) => {
    m.set('type', 'sticky');
    m.set('x', x - 90);
    m.set('y', y - 90);
    m.set('bg', STICKY_COLORS[stickyIdx++ % STICKY_COLORS.length]!);
    m.set('rotation', (Math.random() - 0.5) * 4);
    m.set('text', new Y.Text(''));
  });
  focusNew(id);
}

export function addFlowcard(x: number, y: number): void {
  if (roomIsFull()) return;
  const id = create((m) => {
    m.set('type', 'flowcard');
    m.set('x', x - 70);
    m.set('y', y - 30);
    m.set('text', new Y.Text('Step'));
  });
  focusNew(id);
}

export function addImage(x: number, y: number, src: string): void {
  if (roomIsFull()) return;
  create((m) => {
    m.set('type', 'image');
    m.set('x', x);
    m.set('y', y);
    m.set('src', src);
  });
}

export function addVideo(x: number, y: number, src: string): void {
  if (roomIsFull()) return;
  create((m) => {
    m.set('type', 'video');
    m.set('x', x);
    m.set('y', y);
    m.set('src', src);
  });
}

export function addLink(x: number, y: number, href: string): void {
  if (roomIsFull()) return;
  create((m) => {
    m.set('type', 'link');
    m.set('x', x);
    m.set('y', y);
    m.set('href', href);
  });
}

// --- mount / unmount ----------------------------------------------------------

function mount(id: string): void {
  if (live.has(id)) return;
  const ymap = yObjects.get(id);
  if (!ymap) return;
  const type = ymap.get('type') as ObjType;

  const built = buildElement(type, ymap);
  const el = built.el;
  el.classList.add('object');
  el.dataset.objId = id; // lets the selection layer find this element
  el.style.pointerEvents = interactive ? 'auto' : 'none';
  objectLayer.appendChild(el);

  const rec: LiveObj = { id, type, el, ymap, dispose: built.dispose };
  live.set(id, rec);

  const onMapChange = (e: Y.YMapEvent<unknown>): void => {
    const k = e.keysChanged;
    if (k.has('x') || k.has('y') || k.has('rotation') || k.has('scale') || k.has('z')) {
      position(rec);
      requestRender(); // repaint the canvas so connectors track the moved object
    }
    if (k.has('color') && (rec.type === 'text' || rec.type === 'flowcard')) {
      rec.el.style.color = (rec.ymap.get('color') as string) || '';
    }
    if (k.has('bg') && rec.type === 'sticky') {
      rec.el.style.background = (rec.ymap.get('bg') as string) || '';
    }
  };
  ymap.observe(onMapChange);
  const baseDispose = rec.dispose;
  rec.dispose = () => {
    ymap.unobserve(onMapChange);
    baseDispose();
  };

  makeDraggable(rec);
  position(rec);
}

function unmount(id: string): void {
  const rec = live.get(id);
  if (!rec) return;
  rec.dispose();
  rec.el.remove();
  live.delete(id);
}

function position(rec: LiveObj): void {
  const x = (rec.ymap.get('x') as number) ?? 0;
  const y = (rec.ymap.get('y') as number) ?? 0;
  const objScale = (rec.ymap.get('scale') as number) ?? 1;
  const screen = w2s({ x, y });
  rec.el.style.left = `${screen.x}px`;
  rec.el.style.top = `${screen.y}px`;
  rec.el.style.transformOrigin = 'top left';
  rec.el.style.zIndex = String((rec.ymap.get('z') as number) ?? 0);
  // The object's own scale stacks on top of the viewport zoom.
  const s = view.zoom * objScale;
  if (rec.type === 'sticky') {
    const rot = (rec.ymap.get('rotation') as number) ?? 0;
    rec.el.style.transform = `scale(${s}) rotate(${rot}deg)`;
  } else {
    rec.el.style.transform = `scale(${s})`;
  }
}

// --- element builders ---------------------------------------------------------

function buildElement(
  type: ObjType,
  ymap: Y.Map<unknown>,
): { el: HTMLElement; dispose: () => void } {
  if (type === 'text') {
    const el = document.createElement('div');
    el.className = 'obj-text';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.style.color = (ymap.get('color') as string) || 'var(--text)';
    const dispose = bindText(el, ymap.get('text') as Y.Text);
    return { el, dispose };
  }

  if (type === 'sticky') {
    const el = document.createElement('div');
    el.className = 'obj-sticky';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.style.background = (ymap.get('bg') as string) || '#ffd84d';
    const dispose = bindText(el, ymap.get('text') as Y.Text);
    return { el, dispose };
  }

  if (type === 'flowcard') {
    const el = document.createElement('div');
    el.className = 'obj-flowcard';
    el.contentEditable = 'true';
    el.spellcheck = false;
    const col = ymap.get('color') as string;
    if (col) el.style.color = col;
    const dispose = bindText(el, ymap.get('text') as Y.Text);
    return { el, dispose };
  }

  if (type === 'image') {
    const el = document.createElement('div');
    el.className = 'obj-image';
    const img = document.createElement('img');
    img.src = (ymap.get('src') as string) || '';
    img.draggable = false;
    img.onerror = () => {
      el.innerHTML = '';
      el.classList.add('obj-broken');
      el.textContent = 'image unavailable';
    };
    el.appendChild(img);
    return { el, dispose: () => {} };
  }

  if (type === 'video') {
    const el = document.createElement('div');
    el.className = 'obj-video';
    const iframe = document.createElement('iframe');
    iframe.src = (ymap.get('src') as string) || '';
    iframe.allowFullscreen = true;
    el.appendChild(iframe);
    return { el, dispose: () => {} };
  }

  // link
  const a = document.createElement('a');
  a.className = 'obj-link';
  a.draggable = false; // kill the browser's native link-drag so we can move it
  const href = (ymap.get('href') as string) || '';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  let host = 'link';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    /* keep default */
  }
  const hostEl = document.createElement('div');
  hostEl.className = 'url-host';
  hostEl.textContent = host;
  const fullEl = document.createElement('div');
  fullEl.className = 'url-full';
  fullEl.textContent = href;
  a.append(hostEl, fullEl);
  return { el: a, dispose: () => {} };
}

// --- Y.Text ⇄ contenteditable binding ----------------------------------------

function bindText(el: HTMLElement, ytext: Y.Text): () => void {
  el.style.whiteSpace = 'pre-wrap';

  const fromRemote = (): void => {
    const next = ytext.toString();
    if (el.textContent === next) return;
    if (document.activeElement === el) {
      const caret = getCaret(el);
      el.textContent = next;
      setCaret(el, caret);
    } else {
      el.textContent = next;
    }
  };
  ytext.observe(fromRemote);
  fromRemote();

  const onInput = (): void => {
    const next = el.textContent ?? '';
    const prev = ytext.toString();
    if (next === prev) return;
    // Minimal diff — common prefix + common suffix — so concurrent edits
    // elsewhere in the same note survive.
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let endP = prev.length;
    let endN = next.length;
    while (endP > start && endN > start && prev[endP - 1] === next[endN - 1]) {
      endP--;
      endN--;
    }
    transact(() => {
      if (endP > start) ytext.delete(start, endP - start);
      if (endN > start) ytext.insert(start, next.slice(start, endN));
    });
  };
  el.addEventListener('input', onInput);

  // Keep the content a single text node: insert a real newline rather than
  // letting the browser create <div>/<br> children.
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
    }
  };
  el.addEventListener('keydown', onKeydown);

  return () => {
    ytext.unobserve(fromRemote);
    el.removeEventListener('input', onInput);
    el.removeEventListener('keydown', onKeydown);
  };
}

function getCaret(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaret(el: HTMLElement, offset: number): void {
  const text = el.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return;
  const off = Math.max(0, Math.min(offset, (el.textContent ?? '').length));
  const range = document.createRange();
  const sel = window.getSelection();
  try {
    range.setStart(text, off);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {
    /* selection out of range — ignore */
  }
}

// --- dragging -----------------------------------------------------------------

function makeDraggable(rec: LiveObj): void {
  const editable = rec.el.isContentEditable;
  const isLink = rec.type === 'link';
  let offset: { x: number; y: number } | null = null;
  let moved = false;

  rec.el.addEventListener('pointerdown', (e) => {
    if (state.tool !== 'select' && state.tool !== 'hand') return;
    if (editable && document.activeElement === rec.el) return; // editing - don't drag
    if (state.tool === 'select') select('object', rec.id);
    offset = { x: e.clientX - rec.el.offsetLeft, y: e.clientY - rec.el.offsetTop };
    moved = false;
    rec.el.classList.add('dragging');
    rec.el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  rec.el.addEventListener('pointermove', (e) => {
    if (!offset) return;
    moved = true;
    const wp = s2w({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    transact(() => {
      rec.ymap.set('x', wp.x);
      rec.ymap.set('y', wp.y);
    });
  });

  const end = (): void => {
    offset = null;
    rec.el.classList.remove('dragging');
  };
  rec.el.addEventListener('pointerup', end);
  rec.el.addEventListener('pointercancel', end);

  // A link card: with the Select tool a click selects/moves it; double-click
  // opens the URL. It never navigates at the end of a drag.
  if (isLink) {
    rec.el.addEventListener('click', (e) => {
      if (moved || state.tool === 'select') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    rec.el.addEventListener('dblclick', () => {
      const href = rec.ymap.get('href') as string;
      if (href) window.open(href, '_blank', 'noopener');
    });
  }

  // Double-click any text object to edit it - works for everyone in the room.
  if (editable) {
    rec.el.addEventListener('dblclick', () => rec.el.focus());
  }
}

// --- snapshot support ---------------------------------------------------------

/** Live objects with the fields the PNG snapshot needs. */
export function liveObjectsForSnapshot(): Array<{
  el: HTMLElement;
  type: ObjType;
  rotation: number;
  bg: string;
  text: string;
}> {
  return [...live.values()].map((r) => ({
    el: r.el,
    type: r.type,
    rotation: (r.ymap.get('rotation') as number) ?? 0,
    bg: (r.ymap.get('bg') as string) ?? '',
    text: r.el.textContent ?? '',
  }));
}
