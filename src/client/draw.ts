// Pointer input on the canvas: freehand strokes, vector shapes, click-to-place
// objects, panning, and wheel zoom. While a stroke or shape is in progress it
// is streamed over awareness (see presence.setDraft) so peers watch it live;
// it is committed to the Yjs document only on pointer-up.

import { LIMITS } from '../shared/schema';
import {
  yStrokes,
  yShapes,
  transact,
  genId,
  itemCount,
  clientUid,
  type Stroke,
  type Shape,
} from './sync';
import { logEvent } from './log';
import {
  canvasEl,
  view,
  s2w,
  render,
  requestRender,
  onWorldDraw,
  drawStroke,
  drawShape,
  zoomAt,
} from './canvas';
import { state, toolCursor } from './state';
import { addText, addSticky, addFlowcard } from './objects';
import { setDraft } from './presence';
import { toast } from './toast';
import { hitTestShapes, select, deselect } from './selection';
import { hitTestEdge } from './connectors';

const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'line', 'arrow']);

let isDrawing = false;
let isPanning = false;
let lastPan: { x: number; y: number } | null = null;
let currentStroke: Stroke | null = null;
let currentShape: Shape | null = null;

// Dragging an already-placed shape with the Select tool.
let movingShapeId: string | null = null;
let moveStartWorld = { x: 0, y: 0 };
let moveShapeOrigin = { x: 0, y: 0 };

/** Attach all canvas pointer handlers. `onFirstAction` fades the empty hints. */
export function initDraw(onFirstAction: () => void): void {
  // Paint my own in-progress stroke/shape over the committed content.
  onWorldDraw((c) => {
    if (currentStroke) drawStroke(currentStroke, c);
    if (currentShape) drawShape(currentShape, c);
  });

  canvasEl.addEventListener('pointerdown', (e) => onPointerDown(e, onFirstAction));
  canvasEl.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    },
    { passive: false },
  );
}

function atCapacity(): boolean {
  if (itemCount() >= LIMITS.objectsPerRoom) {
    toast(`room is full - ${LIMITS.objectsPerRoom.toLocaleString()} item limit`);
    return true;
  }
  return false;
}

function onPointerDown(e: PointerEvent, onFirstAction: () => void): void {
  onFirstAction();
  const sp = { x: e.clientX, y: e.clientY };
  const wp = s2w(sp);

  // Pan: middle mouse, space held, or the hand tool.
  if (e.button === 1 || state.spaceDown || state.tool === 'hand') {
    isPanning = true;
    lastPan = sp;
    canvasEl.style.cursor = 'grabbing';
    return;
  }
  if (state.tool === 'select') {
    // Select tool on the canvas: a connector first, then a shape, else clear.
    const edgeHit = hitTestEdge(wp);
    if (edgeHit) {
      select('edge', edgeHit);
      return;
    }
    const hit = hitTestShapes(wp);
    if (hit) {
      select('shape', hit);
      const s = yShapes.get(hit);
      if (s) {
        movingShapeId = hit;
        moveStartWorld = wp;
        moveShapeOrigin = { x: s.x, y: s.y };
      }
    } else {
      deselect();
    }
    return;
  }

  if (state.tool === 'pen' || state.tool === 'marker' || state.tool === 'eraser') {
    if (atCapacity()) return;
    isDrawing = true;
    currentStroke = {
      id: genId(),
      tool: state.tool,
      color: state.color,
      size: state.size,
      points: [wp],
      by: clientUid,
    };
  } else if (SHAPE_TOOLS.has(state.tool)) {
    if (atCapacity()) return;
    isDrawing = true;
    currentShape = {
      id: genId(),
      type: state.tool as Shape['type'],
      x: wp.x,
      y: wp.y,
      w: 0,
      h: 0,
      color: state.color,
      size: state.size,
      fill: state.fill ?? undefined,
      by: clientUid,
    };
  } else if (state.tool === 'text') {
    addText(wp.x, wp.y);
  } else if (state.tool === 'sticky') {
    addSticky(wp.x, wp.y);
  } else if (state.tool === 'flowcard') {
    addFlowcard(wp.x, wp.y);
  }
}

function onPointerMove(e: PointerEvent): void {
  const sp = { x: e.clientX, y: e.clientY };

  if (isPanning && lastPan) {
    view.x += sp.x - lastPan.x;
    view.y += sp.y - lastPan.y;
    lastPan = sp;
    render();
    return;
  }

  if (movingShapeId) {
    const wp = s2w(sp);
    const s = yShapes.get(movingShapeId);
    if (s) {
      transact(() =>
        yShapes.set(movingShapeId!, {
          ...s,
          x: moveShapeOrigin.x + (wp.x - moveStartWorld.x),
          y: moveShapeOrigin.y + (wp.y - moveStartWorld.y),
        }),
      );
      requestRender();
    }
    return;
  }

  if (!isDrawing) return;
  e.preventDefault();
  const wp = s2w(sp);

  if (currentStroke) {
    currentStroke.points.push(wp);
    setDraft({ kind: 'stroke', ...currentStroke });
    requestRender();
  } else if (currentShape) {
    currentShape.w = wp.x - currentShape.x;
    currentShape.h = wp.y - currentShape.y;
    setDraft({ kind: 'shape', ...currentShape });
    requestRender();
  }
}

function onPointerUp(): void {
  if (isPanning) {
    isPanning = false;
    lastPan = null;
    canvasEl.style.cursor = toolCursor();
  }

  // Commit the finished stroke / shape to the shared document.
  if (currentStroke) {
    const stroke = currentStroke;
    if (stroke.points.length > 0) transact(() => yStrokes.push([stroke]));
    currentStroke = null;
  }
  if (currentShape) {
    const shape = currentShape;
    // Drop zero-size shapes from an accidental click.
    if (Math.abs(shape.w) > 2 || Math.abs(shape.h) > 2) {
      shape.z = Math.max(0, ...[...yShapes.values()].map((s) => s.z ?? 0)) + 1;
      transact(() => yShapes.set(shape.id, shape));
      logEvent('added a ' + shape.type);
    }
    currentShape = null;
  }

  movingShapeId = null;
  isDrawing = false;
  setDraft(null);
  requestRender();
}
