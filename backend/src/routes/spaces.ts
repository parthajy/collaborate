import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  slugSchema,
  createItemRequestSchema,
  updateItemRequestSchema,
  type Space,
  type CanvasItem,
  type SSEEvent,
  type CursorPosition,
} from "../types";
import { subscribe, unsubscribe, broadcast } from "../sse";

const spacesRouter = new Hono();

// In-memory storage for spaces
const spaces = new Map<string, Space>();

// In-memory storage for cursor positions (per space)
const cursors = new Map<string, Map<string, CursorPosition>>();

// Helper to get or create a space
function getOrCreateSpace(slug: string): Space {
  if (!spaces.has(slug)) {
    const now = new Date().toISOString();
    spaces.set(slug, {
      slug,
      items: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return spaces.get(slug)!;
}

// Helper to generate unique item IDs
let itemIdCounter = 0;
function generateItemId(): string {
  return `item-${++itemIdCounter}-${Date.now()}`;
}

// GET /api/spaces/:slug - Get or create a space by slug
spacesRouter.get(
  "/:slug",
  zValidator("param", z.object({ slug: slugSchema })),
  (c) => {
    const { slug } = c.req.valid("param");
    const space = getOrCreateSpace(slug);
    return c.json({ data: space });
  }
);

// POST /api/spaces/:slug/items - Create a canvas item
spacesRouter.post(
  "/:slug/items",
  zValidator("param", z.object({ slug: slugSchema })),
  zValidator("json", createItemRequestSchema),
  (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const space = getOrCreateSpace(slug);
    const now = new Date().toISOString();

    const item: CanvasItem = {
      id: generateItemId(),
      type: body.type,
      x: body.x,
      y: body.y,
      width: body.width,
      height: body.height,
      content: body.content,
      color: body.color,
      url: body.url,
      shapeType: body.shapeType,
      fontSize: body.fontSize,
      zIndex: 0,
      points: body.points,
      strokeColor: body.strokeColor,
      strokeWidth: body.strokeWidth,
      createdAt: now,
      updatedAt: now,
    };

    space.items.push(item);
    space.updatedAt = now;

    // Broadcast to SSE clients
    const event: SSEEvent = { type: "item:created", item };
    broadcast(slug, event);

    return c.json({ data: item }, 201);
  }
);

// PATCH /api/spaces/:slug/items/:itemId - Update a canvas item
spacesRouter.patch(
  "/:slug/items/:itemId",
  zValidator("param", z.object({ slug: slugSchema, itemId: z.string() })),
  zValidator("json", updateItemRequestSchema),
  (c) => {
    const { slug, itemId } = c.req.valid("param");
    const updates = c.req.valid("json");

    const space = spaces.get(slug);
    if (!space) {
      return c.json(
        { error: { message: "Space not found", code: "SPACE_NOT_FOUND" } },
        404
      );
    }

    const itemIndex = space.items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      return c.json(
        { error: { message: "Item not found", code: "ITEM_NOT_FOUND" } },
        404
      );
    }

    const now = new Date().toISOString();
    const item = space.items[itemIndex]!;

    // Apply updates
    if (updates.x !== undefined) item.x = updates.x;
    if (updates.y !== undefined) item.y = updates.y;
    if (updates.width !== undefined) item.width = updates.width;
    if (updates.height !== undefined) item.height = updates.height;
    if (updates.content !== undefined) item.content = updates.content;
    if (updates.color !== undefined) item.color = updates.color;
    if (updates.url !== undefined) item.url = updates.url;
    if (updates.zIndex !== undefined) item.zIndex = updates.zIndex;
    if (updates.shapeType !== undefined) item.shapeType = updates.shapeType;
    if (updates.points !== undefined) item.points = updates.points;
    if (updates.strokeColor !== undefined) item.strokeColor = updates.strokeColor;
    if (updates.strokeWidth !== undefined) item.strokeWidth = updates.strokeWidth;
    item.updatedAt = now;

    space.updatedAt = now;

    // Broadcast to SSE clients
    const event: SSEEvent = { type: "item:updated", item };
    broadcast(slug, event);

    return c.json({ data: item });
  }
);

// DELETE /api/spaces/:slug/items/:itemId - Delete a canvas item
spacesRouter.delete(
  "/:slug/items/:itemId",
  zValidator("param", z.object({ slug: slugSchema, itemId: z.string() })),
  (c) => {
    const { slug, itemId } = c.req.valid("param");

    const space = spaces.get(slug);
    if (!space) {
      return c.json(
        { error: { message: "Space not found", code: "SPACE_NOT_FOUND" } },
        404
      );
    }

    const itemIndex = space.items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      return c.json(
        { error: { message: "Item not found", code: "ITEM_NOT_FOUND" } },
        404
      );
    }

    space.items.splice(itemIndex, 1);
    space.updatedAt = new Date().toISOString();

    // Broadcast to SSE clients
    const event: SSEEvent = { type: "item:deleted", itemId };
    broadcast(slug, event);

    return c.json({ data: { success: true as const } });
  }
);

// DELETE /api/spaces/:slug - Reset/clear a space (delete all items)
spacesRouter.delete(
  "/:slug",
  zValidator("param", z.object({ slug: slugSchema })),
  (c) => {
    const { slug } = c.req.valid("param");

    const space = spaces.get(slug);
    if (space) {
      space.items = [];
      space.updatedAt = new Date().toISOString();
    }

    // Broadcast to SSE clients
    const event: SSEEvent = { type: "space:reset" };
    broadcast(slug, event);

    return c.json({ data: { success: true as const } });
  }
);

// Cursor position update schema
const cursorUpdateSchema = z.object({
  clientId: z.string(),
  x: z.number(),
  y: z.number(),
  name: z.string().optional(),
  color: z.string().optional(),
});

// POST /api/spaces/:slug/cursors - Update cursor position (cursor:move)
spacesRouter.post(
  "/:slug/cursors",
  zValidator("param", z.object({ slug: slugSchema })),
  zValidator("json", cursorUpdateSchema),
  (c) => {
    const { slug } = c.req.valid("param");
    const cursorData = c.req.valid("json");

    // Ensure space exists
    getOrCreateSpace(slug);

    // Get or create cursor map for this space
    if (!cursors.has(slug)) {
      cursors.set(slug, new Map());
    }
    const spaceCursors = cursors.get(slug)!;

    // Check if this is a new cursor (for cursor:join event)
    const isNewCursor = !spaceCursors.has(cursorData.clientId);

    // Update cursor position
    const cursorPosition: CursorPosition = {
      clientId: cursorData.clientId,
      x: cursorData.x,
      y: cursorData.y,
      name: cursorData.name,
      color: cursorData.color,
    };
    spaceCursors.set(cursorData.clientId, cursorPosition);

    // Broadcast cursor event
    if (isNewCursor) {
      const joinEvent: SSEEvent = { type: "cursor:join", cursor: cursorPosition };
      broadcast(slug, joinEvent);
    } else {
      const moveEvent: SSEEvent = { type: "cursor:move", cursor: cursorPosition };
      broadcast(slug, moveEvent);
    }

    return c.json({ data: { success: true as const } });
  }
);

// DELETE /api/spaces/:slug/cursors/:clientId - Remove cursor (cursor:leave)
spacesRouter.delete(
  "/:slug/cursors/:clientId",
  zValidator("param", z.object({ slug: slugSchema, clientId: z.string() })),
  (c) => {
    const { slug, clientId } = c.req.valid("param");

    const spaceCursors = cursors.get(slug);
    if (spaceCursors) {
      const cursor = spaceCursors.get(clientId);
      spaceCursors.delete(clientId);

      // Broadcast cursor:leave event
      const leaveEvent: SSEEvent = {
        type: "cursor:leave",
        cursor: cursor || { clientId, x: 0, y: 0 },
      };
      broadcast(slug, leaveEvent);

      // Clean up empty cursor maps
      if (spaceCursors.size === 0) {
        cursors.delete(slug);
      }
    }

    return c.json({ data: { success: true as const } });
  }
);

// GET /api/spaces/:slug/cursors - Get all cursors in a space
spacesRouter.get(
  "/:slug/cursors",
  zValidator("param", z.object({ slug: slugSchema })),
  (c) => {
    const { slug } = c.req.valid("param");

    const spaceCursors = cursors.get(slug);
    const cursorList = spaceCursors
      ? Array.from(spaceCursors.values())
      : [];

    return c.json({ data: cursorList });
  }
);

// GET /api/spaces/:slug/events - Server-Sent Events for real-time updates
spacesRouter.get(
  "/:slug/events",
  zValidator("param", z.object({ slug: slugSchema })),
  (c) => {
    const { slug } = c.req.valid("param");

    // Ensure space exists
    getOrCreateSpace(slug);

    let clientId: string | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        clientId = subscribe(slug, controller);

        // Send initial connection confirmation
        const encoder = new TextEncoder();
        const message = `data: ${JSON.stringify({ type: "connected", clientId })}\n\n`;
        controller.enqueue(encoder.encode(message));
      },
      cancel() {
        if (clientId) {
          unsubscribe(slug, clientId);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);

export { spacesRouter };
