// Selection system: pick a shape or object, show a bounding box with a resize
// handle, and a contextual properties panel (color, fill, duplicate, z-order,
// delete). This is the foundation the recolor / fill / sticky-customize
// features ride on.

import { Y, yShapes, yObjects, yEdges, transact, genId, clientUid, type Shape, type Edge } from './sync';
import { toast } from './toast';
import { logEvent } from './log';
import { view, w2s, s2w, requestRender } from './canvas';
import { PALETTE, STICKY_PALETTE, buildSwatches, buildCustomSwatch } from './colors';

export type Selection =
  | { kind: 'object'; id: string }
  | { kind: 'shape'; id: string }
  | { kind: 'edge'; id: string }
  | null;

let current: Selection = null;

// --- overlay: bounding box + one bottom-right resize handle -------------------

const overlay = document.createElement('div');
overlay.style.cssText =
  'position:fixed;border:1.5px solid var(--accent);border-radius:2px;' +
  'pointer-events:none;z-index:70;display:none;box-sizing:border-box;';

const handle = document.createElement('div');
handle.style.cssText =
  'position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;' +
  'background:var(--accent);border:2px solid var(--bg);border-radius:3px;' +
  'pointer-events:auto;cursor:nwse-resize;';
overlay.appendChild(handle);
document.body.appendChild(overlay);

// --- properties panel ---------------------------------------------------------

const panel = document.createElement('div');
panel.className = 'surface';
panel.style.cssText =
  'position:fixed;right:12px;top:50%;transform:translateY(-50%);' +
  'z-index:100;width:212px;padding:14px;display:none;' +
  'max-height:calc(100vh - 110px);overflow-y:auto;';
document.body.appendChild(panel);

// --- public API ---------------------------------------------------------------

export function getSelected(): Selection {
  return current;
}

export function select(kind: 'object' | 'shape' | 'edge', id: string): void {
  if (current && current.kind === kind && current.id === id) return;
  current = { kind, id };
  buildPanel();
  panel.style.display = '';
  refreshOverlay();
  startTracking();
}

export function deselect(): void {
  if (!current) return;
  current = null;
  panel.style.display = 'none';
  overlay.style.display = 'none';
  stopTracking();
}

/** Stable id of whoever created an artifact (undefined if it predates stamping). */
function creatorOf(sel: { kind: 'object' | 'shape' | 'edge'; id: string }): string | undefined {
  if (sel.kind === 'shape') return yShapes.get(sel.id)?.by;
  if (sel.kind === 'edge') return yEdges.get(sel.id)?.by;
  return yObjects.get(sel.id)?.get('by') as string | undefined;
}

/** Grey out a Delete button when this client is not the artifact's creator. */
function lockIfNotMine(btn: HTMLButtonElement): void {
  if (!current) return;
  const owner = creatorOf(current);
  if (owner && owner !== clientUid) {
    btn.disabled = true;
    btn.style.opacity = '0.4';
    btn.style.cursor = 'not-allowed';
    btn.title = 'only the person who made it can delete it';
  }
}

/** Delete whatever is selected — but only if this client created it. */
export function deleteSelected(): void {
  if (!current) return;
  const sel = current;
  const owner = creatorOf(sel);
  if (owner && owner !== clientUid) {
    toast('only the person who made it can delete it');
    return;
  }
  transact(() => {
    if (sel.kind === 'shape') yShapes.delete(sel.id);
    else if (sel.kind === 'edge') yEdges.delete(sel.id);
    else yObjects.delete(sel.id);
  });
  const noun =
    sel.kind === 'edge' ? 'a connector' : sel.kind === 'object' ? 'an object' : 'a shape';
  logEvent('deleted ' + noun);
  deselect();
  requestRender();
}

// --- overlay tracking ---------------------------------------------------------
// A rAF loop keeps the box glued to its target through pans, zooms, drags,
// and remote edits without every mover needing to call back here.

let rafId = 0;

function startTracking(): void {
  if (rafId) return;
  const loop = (): void => {
    if (!current) {
      rafId = 0;
      return;
    }
    refreshOverlay();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopTracking(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function objectEl(id: string): HTMLElement | null {
  return document.querySelector(`[data-obj-id="${id}"]`);
}

/** The selected item's bounding box in screen pixels, or null if it's gone. */
function selectedScreenRect(): { x: number; y: number; w: number; h: number } | null {
  if (!current) return null;
  if (current.kind === 'shape') {
    const s = yShapes.get(current.id);
    if (!s) return null;
    const x = Math.min(s.x, s.x + s.w);
    const y = Math.min(s.y, s.y + s.h);
    const tl = w2s({ x, y });
    return { x: tl.x, y: tl.y, w: Math.abs(s.w) * view.zoom, h: Math.abs(s.h) * view.zoom };
  }
  const el = objectEl(current.id);
  if (!el || !yObjects.get(current.id)) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function refreshOverlay(): void {
  if (!current) return;
  // Edges have no bounding box — just the highlighted line drawn by connectors.
  if (current.kind === 'edge') {
    if (!yEdges.get(current.id)) deselect();
    else overlay.style.display = 'none';
    return;
  }
  const r = selectedScreenRect();
  if (!r) {
    deselect(); // the target was deleted (possibly by someone else)
    return;
  }
  overlay.style.display = '';
  overlay.style.left = `${r.x}px`;
  overlay.style.top = `${r.y}px`;
  overlay.style.width = `${r.w}px`;
  overlay.style.height = `${r.h}px`;
}

// --- hit testing (shapes; objects handle their own pointer events) -----------

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

function pointHitsShape(s: Shape, p: { x: number; y: number }, tol: number): boolean {
  const x = Math.min(s.x, s.x + s.w);
  const y = Math.min(s.y, s.y + s.h);
  const w = Math.abs(s.w);
  const h = Math.abs(s.h);
  if (s.type === 'rect') {
    return p.x >= x - tol && p.x <= x + w + tol && p.y >= y - tol && p.y <= y + h + tol;
  }
  if (s.type === 'ellipse') {
    const rx = w / 2 + tol;
    const ry = h / 2 + tol;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (p.x - (x + w / 2)) / rx;
    const dy = (p.y - (y + h / 2)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return distToSegment(p, { x: s.x, y: s.y }, { x: s.x + s.w, y: s.y + s.h }) <= tol;
}

/** Topmost shape under a world point, or null. */
export function hitTestShapes(wp: { x: number; y: number }): string | null {
  const tol = 8 / view.zoom;
  const sorted = [...yShapes.entries()].sort((a, b) => (a[1].z ?? 0) - (b[1].z ?? 0));
  let hit: string | null = null;
  for (const [id, s] of sorted) {
    if (pointHitsShape(s, wp, tol)) hit = id;
  }
  return hit;
}

// --- resize -------------------------------------------------------------------

let resizing = false;
let resizeTopLeft = { x: 0, y: 0 };
let resizeNaturalW = 1;

handle.addEventListener('pointerdown', (e) => {
  if (!current) return;
  e.stopPropagation();
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  resizing = true;
  if (current.kind === 'shape') {
    const s = yShapes.get(current.id);
    if (!s) return;
    resizeTopLeft = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h) };
  } else {
    const m = yObjects.get(current.id);
    const el = objectEl(current.id);
    if (!m || !el) return;
    resizeTopLeft = { x: m.get('x') as number, y: m.get('y') as number };
    resizeNaturalW = el.offsetWidth || 1;
  }
});

handle.addEventListener('pointermove', (e) => {
  if (!resizing || !current) return;
  const wp = s2w({ x: e.clientX, y: e.clientY });
  if (current.kind === 'shape') {
    const s = yShapes.get(current.id);
    if (!s) return;
    const w = Math.max(4, wp.x - resizeTopLeft.x);
    const h = Math.max(4, wp.y - resizeTopLeft.y);
    transact(() =>
      yShapes.set(current!.id, { ...s, x: resizeTopLeft.x, y: resizeTopLeft.y, w, h }),
    );
    requestRender();
  } else {
    const m = yObjects.get(current.id);
    if (!m) return;
    const scale = Math.max(0.25, Math.min(6, (wp.x - resizeTopLeft.x) / resizeNaturalW));
    transact(() => m.set('scale', scale));
  }
});

const endResize = (): void => {
  resizing = false;
};
handle.addEventListener('pointerup', endResize);
handle.addEventListener('pointercancel', endResize);

// --- mutations ---------------------------------------------------------------

function nextZ(): number {
  let max = 0;
  for (const m of yObjects.values()) {
    const z = m.get('z');
    if (typeof z === 'number' && z > max) max = z;
  }
  for (const s of yShapes.values()) {
    if (typeof s.z === 'number' && s.z > max) max = s.z;
  }
  return max + 1;
}

function minZ(): number {
  let min = 0;
  for (const m of yObjects.values()) {
    const z = m.get('z');
    if (typeof z === 'number' && z < min) min = z;
  }
  for (const s of yShapes.values()) {
    if (typeof s.z === 'number' && s.z < min) min = s.z;
  }
  return min;
}

function patchShape(patch: Partial<Shape>): void {
  if (!current || current.kind !== 'shape') return;
  const s = yShapes.get(current.id);
  if (!s) return;
  transact(() => yShapes.set(current!.id, { ...s, ...patch }));
  requestRender();
}

function setObjectField(key: string, value: unknown): void {
  if (!current || current.kind !== 'object') return;
  const m = yObjects.get(current.id);
  if (!m) return;
  transact(() => m.set(key, value));
}

function bumpZ(dir: 1 | -1): void {
  if (!current) return;
  const z = dir > 0 ? nextZ() : minZ() - 1;
  if (current.kind === 'shape') patchShape({ z });
  else setObjectField('z', z);
}

function duplicateSelected(): void {
  if (!current) return;
  if (current.kind === 'shape') {
    const s = yShapes.get(current.id);
    if (!s) return;
    const id = genId();
    transact(() => yShapes.set(id, { ...s, id, x: s.x + 20, y: s.y + 20, z: nextZ() }));
    select('shape', id);
    requestRender();
  } else {
    const src = yObjects.get(current.id);
    if (!src) return;
    const id = genId();
    transact(() => {
      const copy = new Y.Map<unknown>();
      yObjects.set(id, copy);
      src.forEach((value, key) => {
        if (key === 'text' && value instanceof Y.Text) {
          copy.set('text', new Y.Text(value.toString()));
        } else if (key === 'x' || key === 'y') {
          copy.set(key, (value as number) + 20);
        } else {
          copy.set(key, value);
        }
      });
      copy.set('z', nextZ());
    });
    select('object', id);
  }
}

// --- properties panel build --------------------------------------------------

function labelRow(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'opt-label';
  d.textContent = text;
  return d;
}

function colorSection(
  title: string,
  getCurrent: () => string,
  onPick: (hex: string) => void,
  colors: string[] = PALETTE.map((p) => p.hex),
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.appendChild(labelRow(title));
  const grid = document.createElement('div');
  grid.className = 'color-grid';
  const setActive = buildSwatches(grid, colors, (hex) => {
    onPick(hex);
    setActive(hex);
  });
  grid.appendChild(buildCustomSwatch(onPick));
  wrap.appendChild(grid);
  setActive(getCurrent());
  return wrap;
}

function fillSection(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.appendChild(labelRow('FILL'));
  const grid = document.createElement('div');
  grid.className = 'color-grid';

  const none = document.createElement('div');
  none.className = 'color-swatch';
  none.title = 'no fill';
  none.style.cssText =
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:11px;color:var(--text-dim);background:transparent;';
  none.textContent = '/';
  none.addEventListener('click', () => patchShape({ fill: undefined }));
  grid.appendChild(none);

  buildSwatches(grid, PALETTE.map((p) => p.hex), (hex) => patchShape({ fill: hex }));
  grid.appendChild(buildCustomSwatch((hex) => patchShape({ fill: hex })));
  wrap.appendChild(grid);
  return wrap;
}

function actionButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = text;
  b.style.cssText =
    'flex:1;min-width:62px;height:30px;padding:0 8px;font-size:11px;justify-content:center;';
  b.addEventListener('click', onClick);
  return b;
}

function actionsRow(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
  wrap.appendChild(actionButton('Duplicate', duplicateSelected));
  wrap.appendChild(actionButton('Front', () => bumpZ(1)));
  wrap.appendChild(actionButton('Back', () => bumpZ(-1)));
  const del = actionButton('Delete', deleteSelected);
  del.style.color = 'var(--accent)';
  lockIfNotMine(del);
  wrap.appendChild(del);
  return wrap;
}

function patchEdge(patch: Partial<Edge>): void {
  if (!current || current.kind !== 'edge') return;
  const e = yEdges.get(current.id);
  if (!e) return;
  transact(() => yEdges.set(current!.id, { ...e, ...patch }));
  requestRender();
}

/** Quick-pick relationship types for connectors. */
const RELATION_PRESETS = ['relates to', 'depends on', 'blocks', 'leads to', 'part of'];

function edgeLabelSection(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.appendChild(labelRow('RELATIONSHIP'));

  let labelValue = '';
  if (current && current.kind === 'edge') {
    labelValue = yEdges.get(current.id)?.label ?? '';
  }

  const input = document.createElement('input');
  input.id = 'edgeLabelInput';
  input.type = 'text';
  input.placeholder = 'how are they related?';
  input.maxLength = 40;
  input.value = labelValue;
  input.style.cssText =
    'width:100%;box-sizing:border-box;margin-bottom:14px;padding:8px 10px;' +
    'background:var(--bg);border:1px solid var(--line);border-radius:7px;' +
    "color:var(--text);font-family:'Geist',sans-serif;font-size:12px;outline:none;";

  // Preset chips — pick a common relationship in one click.
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;';
  const chipEls: Array<{ text: string; el: HTMLElement }> = [];
  const highlight = (val: string): void => {
    for (const c of chipEls) {
      const on = c.text === val;
      c.el.style.background = on ? 'var(--accent)' : 'var(--bg)';
      c.el.style.color = on ? 'var(--accent-ink)' : 'var(--text-dim)';
      c.el.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
    }
  };
  for (const preset of RELATION_PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = preset;
    chip.style.cssText =
      'padding:4px 9px;border-radius:6px;cursor:pointer;font-size:11px;' +
      "font-family:'Geist',sans-serif;border:1px solid var(--line);" +
      'background:var(--bg);color:var(--text-dim);' +
      'transition:background .15s,color .15s,border-color .15s;';
    chip.addEventListener('click', () => {
      input.value = preset;
      patchEdge({ label: preset });
      highlight(preset);
    });
    chipEls.push({ text: preset, el: chip });
    chips.appendChild(chip);
  }

  input.addEventListener('input', () => {
    patchEdge({ label: input.value });
    highlight(input.value);
  });

  highlight(labelValue);
  wrap.append(chips, input);
  return wrap;
}

function edgeActionsRow(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;margin-top:2px;';
  const del = actionButton('Delete connector', deleteSelected);
  del.style.color = 'var(--accent)';
  del.style.flex = '1';
  lockIfNotMine(del);
  wrap.appendChild(del);
  return wrap;
}

function buildPanel(): void {
  panel.innerHTML = '';
  if (!current) return;

  if (current.kind === 'edge') {
    if (!yEdges.get(current.id)) return;
    panel.appendChild(labelRow('CONNECTOR'));
    panel.appendChild(
      colorSection(
        'LINE COLOR',
        () => yEdges.get(current!.id)?.color ?? '',
        (hex) => patchEdge({ color: hex }),
      ),
    );
    panel.appendChild(edgeLabelSection());
    panel.appendChild(edgeActionsRow());
    return;
  }

  if (current.kind === 'shape') {
    const s = yShapes.get(current.id);
    if (!s) return;
    panel.appendChild(labelRow(s.type.toUpperCase()));
    panel.appendChild(
      colorSection(
        'STROKE',
        () => yShapes.get(current!.id)?.color ?? '',
        (hex) => patchShape({ color: hex }),
      ),
    );
    if (s.type === 'rect' || s.type === 'ellipse') {
      panel.appendChild(fillSection());
    }
    panel.appendChild(actionsRow());
    return;
  }

  const m = yObjects.get(current.id);
  if (!m) return;
  const type = m.get('type') as string;
  panel.appendChild(labelRow(type.toUpperCase()));

  if (type === 'text' || type === 'flowcard') {
    panel.appendChild(
      colorSection(
        'TEXT COLOR',
        () => (yObjects.get(current!.id)?.get('color') as string) ?? '',
        (hex) => setObjectField('color', hex),
      ),
    );
  } else if (type === 'sticky') {
    panel.appendChild(
      colorSection(
        'NOTE COLOR',
        () => (yObjects.get(current!.id)?.get('bg') as string) ?? '',
        (hex) => setObjectField('bg', hex),
        STICKY_PALETTE,
      ),
    );
  }
  // image / video / link carry no color — just the action row.
  panel.appendChild(actionsRow());
}
