// Connectors — relationships between artifacts.
// An edge links any two artifacts (objects or shapes) by id. Edges are drawn
// on the canvas, anchored to live bounding boxes, and created by dragging from
// the connection handles that appear when you hover an artifact with Select.

import { yEdges, yObjects, yShapes, transact, genId, clientUid, type Edge } from './sync';
import { logEvent } from './log';
import { canvasEl, view, w2s, s2w, onWorldDraw, onPostRender, requestRender } from './canvas';
import { state } from './state';
import { getSelected, select, hitTestShapes } from './selection';

const DEFAULT_EDGE_COLOR = '#8a8a90';

// --- geometry ----------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World-space bounding box of any artifact (object or shape), or null. */
function artifactBox(id: string): Box | null {
  const s = yShapes.get(id);
  if (s) {
    return {
      x: Math.min(s.x, s.x + s.w),
      y: Math.min(s.y, s.y + s.h),
      w: Math.abs(s.w),
      h: Math.abs(s.h),
    };
  }
  const m = yObjects.get(id);
  if (m) {
    const el = document.querySelector(`[data-obj-id="${id}"]`) as HTMLElement | null;
    const scale = (m.get('scale') as number) ?? 1;
    return {
      x: (m.get('x') as number) ?? 0,
      y: (m.get('y') as number) ?? 0,
      w: (el?.offsetWidth ?? 120) * scale,
      h: (el?.offsetHeight ?? 60) * scale,
    };
  }
  return null;
}

function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Point where a ray from a box's center in direction `dir` crosses its edge. */
function boxExit(b: Box, dir: { x: number; y: number }): { x: number; y: number } {
  const c = center(b);
  const ax = Math.abs(dir.x);
  const ay = Math.abs(dir.y);
  let t = Infinity;
  if (ax > 1e-6) t = Math.min(t, b.w / 2 / ax);
  if (ay > 1e-6) t = Math.min(t, b.h / 2 / ay);
  if (!isFinite(t)) t = 0;
  return { x: c.x + dir.x * t, y: c.y + dir.y * t };
}

/** Both clipped endpoints of an edge, or null if an endpoint is missing. */
function edgeEnds(e: Edge): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const ba = artifactBox(e.from);
  const bb = artifactBox(e.to);
  if (!ba || !bb) return null;
  const ca = center(ba);
  const cb = center(bb);
  let dx = cb.x - ca.x;
  let dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return { a: boxExit(ba, { x: dx, y: dy }), b: boxExit(bb, { x: -dx, y: -dy }) };
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Topmost edge under a world point, or null. */
export function hitTestEdge(wp: { x: number; y: number }): string | null {
  const tol = 7 / view.zoom;
  let hit: string | null = null;
  for (const [id, e] of yEdges) {
    const ends = edgeEnds(e);
    if (ends && distToSegment(wp, ends.a, ends.b) <= tol) hit = id;
  }
  return hit;
}

// --- rendering ---------------------------------------------------------------

let connecting: { from: string; to: { x: number; y: number } } | null = null;

function drawEdge(
  c: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  selected: boolean,
  label: string | undefined,
  theme: { bg: string; text: string },
): void {
  c.strokeStyle = color;
  c.lineWidth = selected ? 4 : 2.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();

  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const head = 12;
  c.beginPath();
  c.moveTo(b.x, b.y);
  c.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
  c.moveTo(b.x, b.y);
  c.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
  c.stroke();

  if (label) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    c.font = "500 12px 'Geist', sans-serif";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tw = c.measureText(label).width;
    const w = tw + 16;
    const h = 20;
    c.fillStyle = theme.bg;
    c.beginPath();
    c.roundRect(mx - w / 2, my - h / 2, w, h, 6);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = theme.text;
    c.fillText(label, mx, my + 0.5);
  }
}

onWorldDraw((c) => {
  if (yEdges.size === 0 && !connecting) return;
  const root = document.documentElement;
  const theme = {
    bg: getComputedStyle(root).getPropertyValue('--bg-soft').trim() || '#2c2139',
    text: getComputedStyle(root).getPropertyValue('--text').trim() || '#f3eee6',
  };
  const sel = getSelected();
  c.save();
  for (const [id, e] of yEdges) {
    const ends = edgeEnds(e);
    if (!ends) continue;
    drawEdge(
      c,
      ends.a,
      ends.b,
      e.color || DEFAULT_EDGE_COLOR,
      sel?.kind === 'edge' && sel.id === id,
      e.label,
      theme,
    );
  }
  if (connecting) {
    const ba = artifactBox(connecting.from);
    if (ba) {
      const ca = center(ba);
      c.setLineDash([7, 5]);
      c.strokeStyle = DEFAULT_EDGE_COLOR;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ca.x, ca.y);
      c.lineTo(connecting.to.x, connecting.to.y);
      c.stroke();
      c.setLineDash([]);
    }
  }
  c.restore();
});

// --- prune edges when an endpoint artifact is deleted ------------------------

function pruneEdges(deleted: Set<string>): void {
  const dead: string[] = [];
  for (const [id, e] of yEdges) {
    if (deleted.has(e.from) || deleted.has(e.to)) dead.push(id);
  }
  if (dead.length === 0) return;
  transact(() => {
    for (const id of dead) yEdges.delete(id);
  });
  requestRender();
}

yObjects.observe((ev) => {
  const del = new Set<string>();
  ev.changes.keys.forEach((change, key) => {
    if (change.action === 'delete') del.add(key);
  });
  if (del.size) pruneEdges(del);
});
yShapes.observe((ev) => {
  const del = new Set<string>();
  ev.changes.keys.forEach((change, key) => {
    if (change.action === 'delete') del.add(key);
  });
  if (del.size) pruneEdges(del);
});
// Repaint when edges change (remote create / delete / recolor / relabel).
yEdges.observe(() => requestRender());

// --- connection handles (hover) ----------------------------------------------

const handleLayer = document.createElement('div');
handleLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:65;display:none;';

const dots: HTMLElement[] = [];
for (let i = 0; i < 4; i++) {
  const d = document.createElement('div');
  d.className = 'conn-handle';
  d.style.cssText =
    'position:absolute;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;' +
    'border-radius:50%;background:var(--accent);border:2px solid var(--bg);' +
    'box-shadow:0 1px 4px rgba(0,0,0,0.3);pointer-events:auto;cursor:crosshair;';
  handleLayer.appendChild(d);
  dots.push(d);
}
document.body.appendChild(handleLayer);

// A second, non-interactive set of dots that lights up the artifact a
// connector drag is about to land on.
const targetLayer = document.createElement('div');
targetLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:66;display:none;';
const targetDots: HTMLElement[] = [];
for (let i = 0; i < 4; i++) {
  const d = document.createElement('div');
  d.style.cssText =
    'position:absolute;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;' +
    'border-radius:50%;background:var(--accent);border:2px solid var(--bg);' +
    'box-shadow:0 1px 4px rgba(0,0,0,0.3);';
  targetLayer.appendChild(d);
  targetDots.push(d);
}
document.body.appendChild(targetLayer);

let hoverId: string | null = null;

/** Position a set of 4 dots on the N/E/S/W edges of an artifact. */
function placeDotsAround(ds: HTMLElement[], id: string): boolean {
  const box = artifactBox(id);
  if (!box) return false;
  const tl = w2s({ x: box.x, y: box.y });
  const w = box.w * view.zoom;
  const h = box.h * view.zoom;
  const at = (d: HTMLElement, x: number, y: number): void => {
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
  };
  at(ds[0]!, tl.x + w / 2, tl.y);
  at(ds[1]!, tl.x + w, tl.y + h / 2);
  at(ds[2]!, tl.x + w / 2, tl.y + h);
  at(ds[3]!, tl.x, tl.y + h / 2);
  return true;
}

function showHandles(id: string): void {
  if (placeDotsAround(dots, id)) {
    handleLayer.style.display = '';
    hoverId = id;
  } else {
    hideHandles();
  }
}

function hideHandles(): void {
  handleLayer.style.display = 'none';
  hoverId = null;
}

function showTargetHandles(id: string): void {
  targetLayer.style.display = placeDotsAround(targetDots, id) ? '' : 'none';
}

function hideTargetHandles(): void {
  targetLayer.style.display = 'none';
}

/** The artifact under a screen point, preferring DOM objects over shapes. */
function artifactAt(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  const objEl = el?.closest('[data-obj-id]') as HTMLElement | null;
  if (objEl?.dataset.objId) return objEl.dataset.objId;
  return hitTestShapes(s2w({ x: clientX, y: clientY }));
}

/** The selected object/shape (not an edge) — handles show on it too. */
function selectedArtifactId(): string | null {
  const sel = getSelected();
  if (sel && (sel.kind === 'object' || sel.kind === 'shape')) return sel.id;
  return null;
}

// Show connection handles on the hovered artifact — or, when nothing is
// hovered, on the selected one. A held button means a drag, not a hover, so
// the handles get out of the way. (Using e.buttons keeps this stateless — no
// flag can get stuck, and a connector drag never hides its own handle layer.)
window.addEventListener('pointermove', (e) => {
  if (connecting || state.tool !== 'select') return;
  if (e.buttons !== 0) {
    hideHandles();
    return;
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el && el.classList.contains('conn-handle')) return; // cursor on a dot — keep
  const id = artifactAt(e.clientX, e.clientY) ?? selectedArtifactId();
  if (id) showHandles(id);
  else hideHandles();
});

// Keep the handles glued to their artifact through pans and zooms.
onPostRender(() => {
  if (hoverId && !connecting) showHandles(hoverId);
});

// --- connector drag from a handle dot ----------------------------------------

function edgeExists(a: string, b: string): boolean {
  for (const e of yEdges.values()) {
    if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) return true;
  }
  return false;
}

function createEdge(from: string, to: string): void {
  if (from === to || edgeExists(from, to)) return;
  const id = genId();
  transact(() => yEdges.set(id, { id, from, to, color: DEFAULT_EDGE_COLOR, by: clientUid }));
  requestRender();
  logEvent('connected two artifacts');
  select('edge', id);
  // Drop the user straight into naming the relationship.
  setTimeout(() => document.getElementById('edgeLabelInput')?.focus(), 40);
}

for (const d of dots) {
  d.addEventListener('pointerdown', (e) => {
    if (!hoverId) return;
    e.preventDefault();
    d.setPointerCapture(e.pointerId);
    connecting = { from: hoverId, to: s2w({ x: e.clientX, y: e.clientY }) };
    requestRender();
  });
  d.addEventListener('pointermove', (e) => {
    if (!connecting) return;
    connecting.to = s2w({ x: e.clientX, y: e.clientY });
    // Light up the artifact the connector is about to land on.
    const over = artifactAt(e.clientX, e.clientY);
    if (over && over !== connecting.from) showTargetHandles(over);
    else hideTargetHandles();
    requestRender();
  });
  d.addEventListener('pointerup', (e) => {
    if (!connecting) return;
    const from = connecting.from;
    connecting = null;
    hideTargetHandles();
    requestRender();
    const target = artifactAt(e.clientX, e.clientY);
    if (target) createEdge(from, target);
  });
  d.addEventListener('pointercancel', () => {
    connecting = null;
    hideTargetHandles();
    requestRender();
  });
}

// --- double-click a connector to edit its label ------------------------------

canvasEl.addEventListener('dblclick', (e) => {
  if (state.tool !== 'select') return;
  const id = hitTestEdge(s2w({ x: e.clientX, y: e.clientY }));
  if (!id) return;
  select('edge', id);
  setTimeout(() => document.getElementById('edgeLabelInput')?.focus(), 30);
});
