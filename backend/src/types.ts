import { z } from "zod";

// Slug validation: lowercase letters, numbers, hyphens only, 3-50 chars
export const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(
    /^[a-z0-9-]+$/,
    "Slug must contain only lowercase letters, numbers, and hyphens"
  );

// Canvas item types
export const canvasItemTypeSchema = z.enum([
  "sticky",
  "text",
  "shape",
  "image",
  "emoji",
  "drawing",
  "link",
  "table",
  "connector",
]);
export type CanvasItemType = z.infer<typeof canvasItemTypeSchema>;

// Shape types for shape items
export const shapeTypeSchema = z.enum([
  "rectangle",
  "circle",
  "triangle",
  "diamond",
  "star",
  "hexagon",
  "arrow",
  "line",
  // Flowchart shapes
  "terminator",   // Rounded rectangle for start/end
  "process",      // Rectangle for process steps
  "decision",     // Diamond (alias for flowchart clarity)
  "data",         // Parallelogram for input/output
  "document",     // Document shape with wavy bottom
]);
export type ShapeType = z.infer<typeof shapeTypeSchema>;

// Point schema for freehand drawing
export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof pointSchema>;

// Table cell schema
export const tableCellSchema = z.object({
  value: z.string(),
});
export type TableCell = z.infer<typeof tableCellSchema>;

// Connector endpoint schema
export const connectorEndpointSchema = z.object({
  itemId: z.string().optional(),
  x: z.number(),
  y: z.number(),
});
export type ConnectorEndpoint = z.infer<typeof connectorEndpointSchema>;

// Base canvas item schema
export const canvasItemSchema = z.object({
  id: z.string(),
  type: canvasItemTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
  url: z.string().optional(),
  shapeType: shapeTypeSchema.optional(),
  fontSize: z.number().optional(),
  zIndex: z.number().default(0),
  points: z.array(pointSchema).optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  createdBy: z.string().optional(),
  // Table specific
  tableData: z.array(z.array(tableCellSchema)).optional(),
  rows: z.number().optional(),
  cols: z.number().optional(),
  // Connector specific
  connectorType: z.enum(["straight", "elbow", "curved"]).optional(),
  startPoint: connectorEndpointSchema.optional(),
  endPoint: connectorEndpointSchema.optional(),
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CanvasItem = z.infer<typeof canvasItemSchema>;

// Space schema
export const spaceSchema = z.object({
  slug: slugSchema,
  items: z.array(canvasItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Space = z.infer<typeof spaceSchema>;

// Create item request
export const createItemRequestSchema = z.object({
  id: z.string().optional(), // Client-provided ID to prevent SSE duplicates
  type: canvasItemTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
  url: z.string().optional(),
  shapeType: shapeTypeSchema.optional(),
  fontSize: z.number().optional(),
  points: z.array(pointSchema).optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  createdBy: z.string().optional(),
  // Table specific
  tableData: z.array(z.array(tableCellSchema)).optional(),
  rows: z.number().optional(),
  cols: z.number().optional(),
  // Connector specific
  connectorType: z.enum(["straight", "elbow", "curved"]).optional(),
  startPoint: connectorEndpointSchema.optional(),
  endPoint: connectorEndpointSchema.optional(),
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
});
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;

// Update item request (partial)
export const updateItemRequestSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
  url: z.string().optional(),
  zIndex: z.number().optional(),
  shapeType: shapeTypeSchema.optional(),
  points: z.array(pointSchema).optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  // Table specific
  tableData: z.array(z.array(tableCellSchema)).optional(),
  rows: z.number().optional(),
  cols: z.number().optional(),
  // Connector specific
  connectorType: z.enum(["straight", "elbow", "curved"]).optional(),
  startPoint: connectorEndpointSchema.optional(),
  endPoint: connectorEndpointSchema.optional(),
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
});
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;

// SSE event types
export const sseEventTypeSchema = z.enum([
  "item:created",
  "item:updated",
  "item:deleted",
  "space:reset",
  "cursor:move",
  "cursor:join",
  "cursor:leave",
]);
export type SSEEventType = z.infer<typeof sseEventTypeSchema>;

// Cursor position schema
export const cursorPositionSchema = z.object({
  clientId: z.string(),
  x: z.number(),
  y: z.number(),
  name: z.string().optional(),
  color: z.string().optional(),
});
export type CursorPosition = z.infer<typeof cursorPositionSchema>;

export const sseEventSchema = z.object({
  type: sseEventTypeSchema,
  item: canvasItemSchema.optional(),
  itemId: z.string().optional(),
  cursor: cursorPositionSchema.optional(),
});
export type SSEEvent = z.infer<typeof sseEventSchema>;

// API Response types
export const spaceResponseSchema = z.object({
  data: spaceSchema,
});
export type SpaceResponse = z.infer<typeof spaceResponseSchema>;

export const itemResponseSchema = z.object({
  data: canvasItemSchema,
});
export type ItemResponse = z.infer<typeof itemResponseSchema>;

export const successResponseSchema = z.object({
  data: z.object({
    success: z.literal(true),
  }),
});
export type SuccessResponse = z.infer<typeof successResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
