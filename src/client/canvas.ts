// The canvas layer: viewport (pan/zoom), the grid, and rendering of every
// committed stroke and shape. Drawing math is ported verbatim from the
// original single-player room.html — only the data source changed (Yjs).

import { yStrokes, yShapes, type Stroke, type Shape } from './sync';

export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** The shared viewport. Local-only — pan/zoom is never synced. */
export const view: View = { x: 0, y: 0, zoom: 1 };

export const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvasEl.getContext('2d') as CanvasRenderingContext2D;
let DPR = window.devicePixelRatio || 1;

/** World coordinates → screen pixels. */
export function w2s(p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y };
}

/** Screen pixels → world coordinates. */
export function s2w(p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
}

// --- render layers ------------------------------------------------------------
// Other modules contribute to the frame without canvas.ts importing them.

const worldDrawers: Array<(c: CanvasRenderingContext2D) => void> = [];
const postRenderers: Array<() => void> = [];

/** Register a drawer that paints inside the world transform (e.g. live ink). */
export function onWorldDraw(fn: (c: CanvasRenderingContext2D) => void): void {
  worldDrawers.push(fn);
}

/** Register a callback that runs after the canvas paint (DOM layers). */
export function onPostRender(fn: () => void): void {
  postRenderers.push(fn);
}

let rafPending = false;

/** Coalesce render requests to at most one per animation frame. */
export function requestRender(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

/** Paint one full frame: grid, shapes, strokes, live layers, then DOM layers. */
export function render(): void {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  drawGrid();

  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  for (const shape of [...yShapes.values()].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
    drawShape(shape);
  }
  for (const stroke of yStrokes) drawStroke(stroke);
  for (const draw of worldDrawers) draw(ctx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  for (const post of postRenderers) post();
}

/** Resize the backing store to the window and device pixel ratio. */
export function resize(): void {
  DPR = window.devicePixelRatio || 1;
  canvasEl.width = window.innerWidth * DPR;
  canvasEl.height = window.innerHeight * DPR;
  canvasEl.style.width = window.innerWidth + 'px';
  canvasEl.style.height = window.innerHeight + 'px';
  render();
}

function gridDotColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--grid-dot').trim() ||
    'rgba(255,255,255,0.06)'
  );
}

function drawGrid(): void {
  const spacing = 26 * view.zoom;
  if (spacing < 8) return;
  const offsetX = ((view.x % spacing) + spacing) % spacing;
  const offsetY = ((view.y % spacing) + spacing) % spacing;
  ctx.fillStyle = gridDotColor();
  for (let x = offsetX; x < window.innerWidth; x += spacing) {
    for (let y = offsetY; y < window.innerHeight; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw one stroke. Exported so live-ink previews reuse the exact same look. */
export function drawStroke(s: Stroke, c: CanvasRenderingContext2D = ctx): void {
  if (!s.points || s.points.length < 1) return;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  c.globalAlpha = s.tool === 'marker' ? 0.4 : 1;
  c.strokeStyle = s.color;
  c.lineWidth = s.tool === 'marker' ? s.size * 2.5 : s.size;
  c.beginPath();
  c.moveTo(s.points[0]!.x, s.points[0]!.y);
  for (let i = 1; i < s.points.length; i++) {
    const p = s.points[i]!;
    const prev = s.points[i - 1]!;
    c.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
  }
  if (s.points.length > 1) {
    const last = s.points[s.points.length - 1]!;
    c.lineTo(last.x, last.y);
  }
  c.stroke();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/** Draw one shape. Exported so the in-progress shape preview reuses it. */
export function drawShape(s: Shape, c: CanvasRenderingContext2D = ctx): void {
  c.strokeStyle = s.color;
  c.lineWidth = s.size;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  if (s.type === 'rect') {
    if (s.fill) {
      c.fillStyle = s.fill;
      c.fillRect(s.x, s.y, s.w, s.h);
    }
    c.strokeRect(s.x, s.y, s.w, s.h);
  } else if (s.type === 'ellipse') {
    c.beginPath();
    c.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
    if (s.fill) {
      c.fillStyle = s.fill;
      c.fill();
    }
    c.stroke();
  } else if (s.type === 'line') {
    c.beginPath();
    c.moveTo(s.x, s.y);
    c.lineTo(s.x + s.w, s.y + s.h);
    c.stroke();
  } else if (s.type === 'arrow') {
    const x1 = s.x;
    const y1 = s.y;
    const x2 = s.x + s.w;
    const y2 = s.y + s.h;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = 12 + s.size;
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
    c.stroke();
  }
}

// --- viewport changes ---------------------------------------------------------

const viewChangeCbs: Array<() => void> = [];

/** Register a callback fired whenever zoom changes (drives the % readout). */
export function onViewChange(fn: () => void): void {
  viewChangeCbs.push(fn);
}

/** Apply a viewport change: notify listeners and repaint. */
export function commitView(): void {
  for (const fn of viewChangeCbs) fn();
  render();
}

/** Zoom by `factor` about a screen point, keeping that point fixed. */
export function zoomAt(screenX: number, screenY: number, factor: number): void {
  const before = s2w({ x: screenX, y: screenY });
  view.zoom = Math.max(0.1, Math.min(4, view.zoom * factor));
  const after = s2w({ x: screenX, y: screenY });
  view.x += (after.x - before.x) * view.zoom;
  view.y += (after.y - before.y) * view.zoom;
  commitView();
}

/** Reset pan and zoom to the origin. */
export function resetView(): void {
  view.x = 0;
  view.y = 0;
  view.zoom = 1;
  commitView();
}
