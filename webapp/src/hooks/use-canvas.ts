import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasItem, CreateItemRequest, ShapeType } from "@/lib/space-api";
import { spaceApi, STICKY_COLORS, DEFAULT_DIMENSIONS } from "@/lib/space-api";

interface UseCanvasProps {
  slug: string;
  initialItems: CanvasItem[];
  userName?: string;
  userColor?: string;
}

export interface CursorPosition {
  clientId: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

const CURSOR_COLORS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"
];

function getRandomColor() {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

function getGuestName() {
  return `Guest ${Math.floor(Math.random() * 1000)}`;
}

export function useCanvas({ slug, initialItems, userName, userColor }: UseCanvasProps) {
  const [items, setItems] = useState<CanvasItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cursors, setCursors] = useState<CursorPosition[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const maxZIndex = useRef(Math.max(0, ...initialItems.map((i) => i.zIndex || 0)));

  // My cursor info
  const clientId = useRef(`client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const myColor = useRef(userColor || getRandomColor());
  const myName = useRef(userName || getGuestName());
  const lastCursorUpdate = useRef(0);

  // Update refs when props change
  if (userName && userName !== myName.current) {
    myName.current = userName;
  }
  if (userColor && userColor !== myColor.current) {
    myColor.current = userColor;
  }

  // Pending updates for debouncing
  const pendingUpdates = useRef<Map<string, { updates: Partial<CanvasItem>; timeout: NodeJS.Timeout }>>(new Map());

  // Track items we created ourselves to avoid duplicates from SSE
  const myCreatedItems = useRef<Set<string>>(new Set());
  // Track items we deleted to avoid them coming back from SSE
  const myDeletedItems = useRef<Set<string>>(new Set());
  // Track recent updates we made to avoid SSE overwriting them
  const recentUpdates = useRef<Map<string, number>>(new Map());

  // Subscribe to real-time events
  useEffect(() => {
    const unsubscribe = spaceApi.subscribeToEvents(slug, (event) => {
      switch (event.type) {
        case "item:created":
          if (event.item) {
            // Skip if we created this item (already added via optimistic update)
            if (myCreatedItems.current.has(event.item.id)) {
              myCreatedItems.current.delete(event.item.id);
              return;
            }
            // Skip if we deleted this item
            if (myDeletedItems.current.has(event.item.id)) {
              return;
            }
            setItems((prev) => {
              // Also check for existing items with same id
              if (prev.some((i) => i.id === event.item!.id)) return prev;
              return [...prev, event.item!];
            });
          }
          break;
        case "item:updated":
          if (event.item) {
            // Skip if we deleted this item
            if (myDeletedItems.current.has(event.item.id)) {
              return;
            }
            // Skip if we recently updated this item (to prevent SSE from reverting our changes)
            const lastUpdate = recentUpdates.current.get(event.item.id);
            if (lastUpdate && Date.now() - lastUpdate < 500) {
              return;
            }
            setItems((prev) =>
              prev.map((i) => (i.id === event.item!.id ? event.item! : i))
            );
          }
          break;
        case "item:deleted":
          if (event.itemId) {
            setItems((prev) => prev.filter((i) => i.id !== event.itemId));
            setSelectedId((prev) => (prev === event.itemId ? null : prev));
          }
          break;
        case "space:reset":
          setItems([]);
          setSelectedId(null);
          break;
        case "cursor:join":
          if (event.cursor && event.cursor.clientId !== clientId.current) {
            const cursor = event.cursor;
            setCursors((prev) => {
              if (prev.some((c) => c.clientId === cursor.clientId)) return prev;
              const newCursor: CursorPosition = {
                clientId: cursor.clientId,
                x: cursor.x,
                y: cursor.y,
                name: cursor.name ?? "Guest",
                color: cursor.color ?? "#888888",
              };
              return [...prev, newCursor];
            });
            setNotification(`${cursor.name ?? "Someone"} joined`);
            setTimeout(() => setNotification(null), 3000);
          }
          break;
        case "cursor:move":
          if (event.cursor && event.cursor.clientId !== clientId.current) {
            const cursor = event.cursor;
            setCursors((prev) =>
              prev.map((c) =>
                c.clientId === cursor.clientId
                  ? {
                      clientId: cursor.clientId,
                      x: cursor.x,
                      y: cursor.y,
                      name: cursor.name ?? c.name,
                      color: cursor.color ?? c.color,
                    }
                  : c
              )
            );
          }
          break;
        case "cursor:leave":
          if (event.cursor) {
            setCursors((prev) =>
              prev.filter((c) => c.clientId !== event.cursor!.clientId)
            );
          }
          break;
      }
    });

    // Join the space
    spaceApi.updateCursor(slug, {
      clientId: clientId.current,
      x: 0,
      y: 0,
      name: myName.current,
      color: myColor.current,
    });

    // Cleanup on unmount
    return () => {
      // Clear all pending updates
      pendingUpdates.current.forEach((pending) => clearTimeout(pending.timeout));
      pendingUpdates.current.clear();
      spaceApi.removeCursor(slug, clientId.current);
      unsubscribe();
    };
  }, [slug]);

  // Update my cursor position
  const updateMyCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastCursorUpdate.current < 50) return; // Throttle to 20fps
      lastCursorUpdate.current = now;

      spaceApi.updateCursor(slug, {
        clientId: clientId.current,
        x,
        y,
        name: myName.current,
        color: myColor.current,
      });
    },
    [slug]
  );

  // Create item with full options
  const createItem = useCallback(
    async (
      type: CanvasItem["type"],
      options?: {
        position?: { x: number; y: number };
        shapeType?: ShapeType;
        content?: string;
        url?: string;
        points?: Array<{ x: number; y: number }>;
        strokeColor?: string;
        strokeWidth?: number;
        connectorType?: "straight" | "elbow" | "curved";
      }
    ) => {
      const centerX = (-pan.x + window.innerWidth / 2) / zoom;
      const centerY = (-pan.y + window.innerHeight / 2) / zoom;
      const dims = DEFAULT_DIMENSIONS[type] || { width: 200, height: 200 };

      // Build base request
      const request: CreateItemRequest = {
        type,
        x: options?.position?.x ?? centerX - dims.width / 2,
        y: options?.position?.y ?? centerY - dims.height / 2,
        width: dims.width,
        height: dims.height,
        color: type === "sticky" ? STICKY_COLORS[0].value : undefined,
        content: options?.content ?? (type === "sticky" ? "" : type === "text" ? "Double-click to edit" : type === "link" ? "https://" : ""),
        shapeType: options?.shapeType ?? (type === "shape" ? "rectangle" : undefined),
        url: options?.url,
        points: options?.points,
        strokeColor: options?.strokeColor ?? "#000000",
        strokeWidth: options?.strokeWidth ?? 3,
        createdBy: myName.current,
      };

      // Add table-specific data
      if (type === "table") {
        const tableData = Array(3).fill(null).map(() =>
          Array(3).fill(null).map(() => ({ value: "" }))
        );
        request.tableData = tableData;
        request.rows = 3;
        request.cols = 3;
      }

      // Add connector-specific data
      if (type === "connector") {
        const connType = options?.content as "straight" | "elbow" | "curved" || "straight";
        request.connectorType = connType;
        request.startPoint = { x: centerX - 50, y: centerY };
        request.endPoint = { x: centerX + 50, y: centerY };
        request.arrowEnd = true;
        request.arrowStart = false;
        request.content = undefined; // Clear content since we used it for type
      }

      try {
        // Optimistic update
        const tempId = `temp-${Date.now()}`;
        const tempItem: CanvasItem = {
          id: tempId,
          ...request,
          zIndex: maxZIndex.current + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setItems((prev) => [...prev, tempItem]);

        const newItem = await spaceApi.createItem(slug, request);

        // Mark this item as created by us to avoid SSE duplicate
        myCreatedItems.current.add(newItem.id);

        // Replace temp item with real one
        setItems((prev) => prev.map((i) => (i.id === tempId ? newItem : i)));
        setSelectedId(newItem.id);
        return newItem;
      } catch (error) {
        // Remove temp item on error
        setItems((prev) => prev.filter((i) => !i.id.startsWith("temp-")));
        console.error("Failed to create item:", error);
        throw error;
      }
    },
    [slug, pan, zoom]
  );

  // Update item with debounced backend sync for smooth dragging
  const updateItem = useCallback(
    async (itemId: string, updates: Partial<CanvasItem>) => {
      // Skip temp items for backend updates
      if (itemId.startsWith("temp-")) {
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
        );
        return;
      }

      // Mark this item as recently updated to prevent SSE from reverting
      recentUpdates.current.set(itemId, Date.now());

      // Immediate local update for smooth UI
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
      );

      // Debounce backend update for position changes (x, y)
      const isPositionUpdate = "x" in updates || "y" in updates;

      if (isPositionUpdate) {
        // Clear existing timeout for this item
        const existing = pendingUpdates.current.get(itemId);
        if (existing) {
          clearTimeout(existing.timeout);
          // Merge with existing pending updates
          updates = { ...existing.updates, ...updates };
        }

        // Set new debounced update
        const timeout = setTimeout(async () => {
          pendingUpdates.current.delete(itemId);
          try {
            await spaceApi.updateItem(slug, itemId, updates);
          } catch (error) {
            console.error("Failed to update item:", error);
          }
        }, 100); // 100ms debounce for position updates

        pendingUpdates.current.set(itemId, { updates, timeout });
      } else {
        // Immediate update for non-position changes (color, content, etc.)
        try {
          await spaceApi.updateItem(slug, itemId, updates);
        } catch (error) {
          console.error("Failed to update item:", error);
        }
      }
    },
    [slug]
  );

  // Delete item with optimistic UI
  const deleteItem = useCallback(
    async (itemId: string) => {
      console.log("Deleting item:", itemId);

      // Clear any pending updates for this item
      const pending = pendingUpdates.current.get(itemId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingUpdates.current.delete(itemId);
      }

      // Mark as deleted to prevent SSE from bringing it back
      myDeletedItems.current.add(itemId);

      // Optimistic update
      const deletedItem = items.find((i) => i.id === itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      if (selectedId === itemId) setSelectedId(null);

      // Don't call backend for temp items (optimistic items that haven't been saved yet)
      if (itemId.startsWith("temp-")) {
        return;
      }

      try {
        await spaceApi.deleteItem(slug, itemId);
        console.log("Item deleted successfully");
        // Clean up after successful delete (allow re-creation if needed)
        setTimeout(() => {
          myDeletedItems.current.delete(itemId);
        }, 5000);
      } catch (error) {
        // Restore on error
        console.error("Failed to delete item:", error);
        myDeletedItems.current.delete(itemId);
        if (deletedItem) {
          setItems((prev) => [...prev, deletedItem]);
        }
      }
    },
    [slug, selectedId, items]
  );

  // Bring to front
  const bringToFront = useCallback(
    async (itemId: string) => {
      maxZIndex.current += 1;
      await updateItem(itemId, { zIndex: maxZIndex.current });
    },
    [updateItem]
  );

  // Reset space
  const resetSpace = useCallback(async () => {
    try {
      await spaceApi.resetSpace(slug);
    } catch (error) {
      console.error("Failed to reset space:", error);
    }
  }, [slug]);

  // Pan handlers
  const handlePan = useCallback((delta: { x: number; y: number }) => {
    setPan((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  // Zoom handlers
  const handleZoom = useCallback((delta: number, center?: { x: number; y: number }) => {
    setZoom((prev) => {
      const newZoom = Math.min(3, Math.max(0.1, prev + delta));
      if (center) {
        const scale = newZoom / prev;
        setPan((p) => ({
          x: center.x - (center.x - p.x) * scale,
          y: center.y - (center.y - p.y) * scale,
        }));
      }
      return newZoom;
    });
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  return {
    items,
    selectedId,
    setSelectedId,
    pan,
    zoom,
    cursors,
    notification,
    createItem,
    updateItem,
    deleteItem,
    bringToFront,
    resetSpace,
    handlePan,
    handleZoom,
    resetView,
    updateMyCursor,
  };
}
