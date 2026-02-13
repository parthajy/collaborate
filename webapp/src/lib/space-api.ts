import type { CanvasItem, Space, CreateItemRequest, UpdateItemRequest, SSEEvent } from "../../../backend/src/types";

export type { CanvasItem, Space, CreateItemRequest, UpdateItemRequest, SSEEvent };

export type ShapeType = "rectangle" | "circle" | "triangle" | "diamond" | "star" | "hexagon" | "arrow" | "line";

export interface CursorData {
  clientId: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Space API
export const spaceApi = {
  getOrCreate: async (slug: string): Promise<Space> => {
    const response = await fetch(`${API_BASE_URL}/api/spaces/${slug}`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to load space");
    }
    const json = await response.json();
    return json.data;
  },

  createItem: async (slug: string, item: CreateItemRequest): Promise<CanvasItem> => {
    const response = await fetch(`${API_BASE_URL}/api/spaces/${slug}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create item");
    }
    const json = await response.json();
    return json.data;
  },

  updateItem: async (slug: string, itemId: string, updates: Partial<CanvasItem>): Promise<CanvasItem> => {
    const response = await fetch(`${API_BASE_URL}/api/spaces/${slug}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to update item");
    }
    const json = await response.json();
    return json.data;
  },

  deleteItem: async (slug: string, itemId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/spaces/${slug}/items/${itemId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to delete item");
    }
  },

  resetSpace: async (slug: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/spaces/${slug}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to reset space");
    }
  },

  // Cursor management
  updateCursor: async (slug: string, cursor: CursorData): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/api/spaces/${slug}/cursors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cursor),
      });
    } catch (e) {
      // Silently fail cursor updates
    }
  },

  removeCursor: async (slug: string, clientId: string): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/api/spaces/${slug}/cursors/${clientId}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch (e) {
      // Silently fail
    }
  },

  // SSE connection for real-time updates
  subscribeToEvents: (slug: string, onEvent: (event: SSEEvent) => void): (() => void) => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/spaces/${slug}/events`, {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEvent(data);
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE connection error");
    };

    return () => {
      eventSource.close();
    };
  },
};

// Sticky note colors
export const STICKY_COLORS = [
  { name: "yellow", value: "#FEF9C3", dark: "#CA8A04" },
  { name: "pink", value: "#FCE7F3", dark: "#DB2777" },
  { name: "blue", value: "#DBEAFE", dark: "#2563EB" },
  { name: "green", value: "#DCFCE7", dark: "#16A34A" },
  { name: "orange", value: "#FED7AA", dark: "#EA580C" },
  { name: "purple", value: "#E9D5FF", dark: "#9333EA" },
];

// Default dimensions
export const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  sticky: { width: 200, height: 200 },
  text: { width: 250, height: 40 },
  image: { width: 300, height: 200 },
  shape: { width: 100, height: 100 },
  emoji: { width: 60, height: 60 },
  drawing: { width: 400, height: 300 },
  link: { width: 280, height: 60 },
};
