import type { CanvasItem } from "./space-api";

export interface ConnectionPoint {
  x: number;
  y: number;
  side: "top" | "right" | "bottom" | "left";
}

const SNAP_DISTANCE = 20; // Distance in canvas units to snap to a connection point
const GRID_SIZE = 20; // Grid snap size

/**
 * Get the connection points (edge midpoints) for a shape item
 */
export function getShapeConnectionPoints(item: CanvasItem): ConnectionPoint[] {
  const { x, y, width = 100, height = 100 } = item;

  return [
    { x: x + width / 2, y: y, side: "top" },
    { x: x + width, y: y + height / 2, side: "right" },
    { x: x + width / 2, y: y + height, side: "bottom" },
    { x: x, y: y + height / 2, side: "left" },
  ];
}

/**
 * Get the center point of an item
 */
export function getItemCenter(item: CanvasItem): { x: number; y: number } {
  const { x, y, width = 100, height = 100 } = item;
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

/**
 * Find the nearest connection point to a given position
 */
export function findNearestConnectionPoint(
  position: { x: number; y: number },
  items: CanvasItem[],
  excludeItemId?: string
): { point: ConnectionPoint; itemId: string; distance: number } | null {
  let nearest: { point: ConnectionPoint; itemId: string; distance: number } | null = null;

  for (const item of items) {
    // Only check shapes and other connectable items
    if (item.type !== "shape" && item.type !== "sticky" && item.type !== "text") continue;
    if (item.id === excludeItemId) continue;

    const points = getShapeConnectionPoints(item);
    for (const point of points) {
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance < SNAP_DISTANCE && (!nearest || distance < nearest.distance)) {
        nearest = { point, itemId: item.id, distance };
      }
    }
  }

  return nearest;
}

/**
 * Snap a position to the grid
 */
export function snapToGrid(position: { x: number; y: number }, gridSize: number = GRID_SIZE): { x: number; y: number } {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

/**
 * Get the best connection point on a shape for connecting to a target position
 */
export function getBestConnectionPoint(
  item: CanvasItem,
  targetPosition: { x: number; y: number }
): ConnectionPoint {
  const points = getShapeConnectionPoints(item);
  let best = points[0];
  let bestDistance = Infinity;

  for (const point of points) {
    const distance = Math.hypot(targetPosition.x - point.x, targetPosition.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  return best;
}

/**
 * Calculate the bounding box for a set of items
 */
export function getItemsBoundingBox(items: CanvasItem[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (items.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const x = item.x;
    const y = item.y;
    const width = item.width || 100;
    const height = item.height || 100;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
