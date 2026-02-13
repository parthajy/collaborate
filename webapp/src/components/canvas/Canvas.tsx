import { useRef, useCallback, useState, useEffect } from "react";
import type { CanvasItem, CursorData } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { StickyNote } from "./StickyNote";
import { TextItem } from "./TextItem";
import { ShapeItem } from "./ShapeItem";
import { ImageItem } from "./ImageItem";
import { EmojiItem } from "./EmojiItem";
import { DrawingItem } from "./DrawingItem";
import { LinkItem } from "./LinkItem";

interface CursorPosition {
  clientId: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

interface CanvasProps {
  items: CanvasItem[];
  selectedId: string | null;
  pan: { x: number; y: number };
  zoom: number;
  cursors?: CursorPosition[];
  isDrawingMode?: boolean;
  isPanMode?: boolean;
  drawingColor?: string;
  drawingWidth?: number;
  onSelect: (id: string | null) => void;
  onPan: (delta: { x: number; y: number }) => void;
  onZoom: (delta: number, center?: { x: number; y: number }) => void;
  onItemUpdate: (id: string, updates: Partial<CanvasItem>) => Promise<void>;
  onItemDelete: (id: string) => Promise<void>;
  onBringToFront: (id: string) => Promise<void>;
  onDoubleClick?: (position: { x: number; y: number }) => void;
  onCursorMove?: (x: number, y: number) => void;
  onDrawingStart?: (startPoint: { x: number; y: number }) => void;
  onDrawingMove?: (point: { x: number; y: number }) => void;
  onDrawingEnd?: (points: Array<{ x: number; y: number }>) => void;
  canvasRef?: React.RefObject<HTMLDivElement>;
}

export function Canvas({
  items,
  selectedId,
  pan,
  zoom,
  cursors = [],
  isDrawingMode = false,
  isPanMode = false,
  drawingColor = "#000000",
  drawingWidth = 3,
  onSelect,
  onPan,
  onZoom,
  onItemUpdate,
  onItemDelete,
  onBringToFront,
  onDoubleClick,
  onCursorMove,
  onDrawingStart,
  onDrawingMove,
  onDrawingEnd,
  canvasRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawingPoints = useRef<Array<{ x: number; y: number }>>([]);

  // Merge refs if canvasRef is provided
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (canvasRef) {
        (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [canvasRef]
  );

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const rect = container.getBoundingClientRect();
      const x = (screenX - rect.left - pan.x) / zoom;
      const y = (screenY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [pan, zoom]
  );

  // Handle wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const delta = -e.deltaY * 0.001;
        const rect = container.getBoundingClientRect();
        onZoom(delta, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else {
        // Pan
        onPan({ x: -e.deltaX, y: -e.deltaY });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [onPan, onZoom]);

  // Handle panning with mouse drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Handle drawing mode
      if (isDrawingMode && e.button === 0 && e.target === containerRef.current) {
        e.preventDefault();
        setIsDrawing(true);
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        drawingPoints.current = [canvasPos];
        onDrawingStart?.(canvasPos);
        return;
      }

      // In pan mode, always start panning on left click on canvas
      if (isPanMode && e.button === 0 && e.target === containerRef.current) {
        e.preventDefault();
        setIsPanning(true);
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Only start panning on middle click or if clicking on the canvas itself (when not in pan mode)
      if (e.button === 1 || (e.button === 0 && e.target === containerRef.current && !isDrawingMode && !isPanMode)) {
        e.preventDefault();
        setIsPanning(true);
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        onSelect(null);
      }
    },
    [onSelect, isDrawingMode, isPanMode, screenToCanvas, onDrawingStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Track cursor position for multiplayer
      if (onCursorMove) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        onCursorMove(canvasPos.x, canvasPos.y);
      }

      // Handle drawing
      if (isDrawing) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        drawingPoints.current.push(canvasPos);
        onDrawingMove?.(canvasPos);
        return;
      }

      if (isPanning) {
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        onPan({ x: dx, y: dy });
      }
    },
    [isPanning, onPan, onCursorMove, screenToCanvas, isDrawing, onDrawingMove]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      if (drawingPoints.current.length > 1) {
        onDrawingEnd?.(drawingPoints.current);
      }
      drawingPoints.current = [];
      return;
    }
    setIsPanning(false);
  }, [isDrawing, onDrawingEnd]);

  // Handle double-click to create sticky note
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== containerRef.current) return;
      if (isDrawingMode) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onDoubleClick?.(canvasPos);
    },
    [screenToCanvas, onDoubleClick, isDrawingMode]
  );

  // Handle item drag
  const handleItemDragStart = useCallback(
    (id: string) => {
      setIsDraggingItem(true);
      onSelect(id);
      onBringToFront(id);
    },
    [onSelect, onBringToFront]
  );

  const handleItemDragEnd = useCallback(() => {
    setIsDraggingItem(false);
  }, []);

  const renderItem = (item: CanvasItem) => {
    const isSelected = item.id === selectedId;
    const props = {
      item,
      isSelected,
      zoom,
      onSelect: () => onSelect(item.id),
      onUpdate: (updates: Partial<CanvasItem>) => onItemUpdate(item.id, updates),
      onDelete: () => onItemDelete(item.id),
      onDragStart: () => handleItemDragStart(item.id),
      onDragEnd: handleItemDragEnd,
    };

    switch (item.type) {
      case "sticky":
        return <StickyNote key={item.id} {...props} />;
      case "text":
        return <TextItem key={item.id} {...props} />;
      case "shape":
        return <ShapeItem key={item.id} {...props} />;
      case "image":
        return <ImageItem key={item.id} {...props} />;
      case "emoji":
        return <EmojiItem key={item.id} {...props} />;
      case "drawing":
        return <DrawingItem key={item.id} {...props} />;
      case "link":
        return <LinkItem key={item.id} {...props} />;
      default:
        return null;
    }
  };

  // Render live drawing preview
  const renderDrawingPreview = () => {
    if (!isDrawing || drawingPoints.current.length < 2) return null;

    let path = `M ${drawingPoints.current[0].x} ${drawingPoints.current[0].y}`;
    for (let i = 1; i < drawingPoints.current.length; i++) {
      path += ` L ${drawingPoints.current[i].x} ${drawingPoints.current[i].y}`;
    }

    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <path
          d={path}
          fill="none"
          stroke={drawingColor}
          strokeWidth={drawingWidth / zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  // Render other users' cursors
  const renderCursors = () => {
    return cursors.map((cursor) => (
      <div
        key={cursor.clientId}
        className="absolute pointer-events-none transition-transform duration-75"
        style={{
          left: cursor.x,
          top: cursor.y,
          zIndex: 9999,
        }}
      >
        {/* Cursor arrow */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: "translate(-2px, -2px)" }}
        >
          <path
            d="M5.65 2.65L20.35 12.35L12.35 14.35L8.35 21.35L5.65 2.65Z"
            fill={cursor.color}
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>
        {/* Name label */}
        <div
          className="absolute left-4 top-4 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
          style={{ backgroundColor: cursor.color }}
        >
          {cursor.name}
        </div>
      </div>
    ));
  };

  return (
    <div
      ref={setRefs}
      className={cn(
        "absolute inset-0 overflow-hidden canvas-container canvas-grid",
        isPanning && "cursor-grabbing",
        !isPanning && !isDraggingItem && !isDrawingMode && !isPanMode && "cursor-default",
        !isPanning && isPanMode && "cursor-grab",
        isDrawingMode && "cursor-crosshair"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="absolute origin-top-left canvas-transition"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {items
          .slice()
          .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
          .map(renderItem)}
        {renderDrawingPreview()}
        {renderCursors()}
      </div>
    </div>
  );
}
