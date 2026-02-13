import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface DrawingItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const STROKE_COLORS = [
  "#000000", // black
  "#EF4444", // red
  "#10B981", // green
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#8B5CF6", // purple
];

export function DrawingItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: DrawingItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const rafRef = useRef<number | null>(null);

  // Sync position from props when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: item.x, y: item.y });
    }
  }, [item.x, item.y, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag if clicking on a button
      if ((e.target as HTMLElement).closest('button')) return;
      e.stopPropagation();
      onSelect();
      setIsDragging(true);
      onDragStart();
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        itemX: item.x,
        itemY: item.y,
      };
    },
    [item.x, item.y, onSelect, onDragStart]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      const newX = dragStart.current.itemX + dx;
      const newY = dragStart.current.itemY + dy;

      // Update local position immediately for smooth visual
      setLocalPos({ x: newX, y: newY });

      // Debounce the actual update
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onUpdate({ x: newX, y: newY });
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, zoom, onUpdate, onDragEnd]);

  // Handle delete click
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete();
    },
    [onDelete]
  );

  // Handle color change
  const handleColorChange = useCallback(
    (e: React.MouseEvent, color: string) => {
      e.stopPropagation();
      e.preventDefault();
      onUpdate({ strokeColor: color });
    },
    [onUpdate]
  );

  // Generate SVG path from points
  const generatePath = () => {
    const points = item.points || [];
    if (points.length < 2) return "";

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  };

  // Calculate bounding box from points
  const getBoundingBox = () => {
    const points = item.points || [];
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    }

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const padding = (item.strokeWidth || 3) * 2;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    };
  };

  const bounds = getBoundingBox();
  const width = Math.max(bounds.maxX - bounds.minX, 20);
  const height = Math.max(bounds.maxY - bounds.minY, 20);

  return (
    <div
      className={cn(
        "absolute cursor-grab select-none",
        isDragging && "dragging cursor-grabbing",
        !isDragging && "canvas-item",
        isSelected && "selected-ring rounded-lg"
      )}
      style={{
        left: localPos.x + bounds.minX,
        top: localPos.y + bounds.minY,
        width,
        height,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
    >
      <svg
        width={width}
        height={height}
        viewBox={`${bounds.minX} ${bounds.minY} ${width} ${height}`}
        className="pointer-events-none"
      >
        <path
          d={generatePath()}
          fill="none"
          stroke={item.strokeColor || "#000000"}
          strokeWidth={item.strokeWidth || 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {isSelected && !isDragging && (
        <div
          className="absolute top-1 right-1 left-1 flex justify-between items-start pointer-events-auto"
          style={{ zIndex: 10 }}
        >
          {/* Color picker */}
          <div className="flex gap-0.5 bg-card/95 p-1 rounded-md shadow-md border border-border">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleColorChange(e, c)}
                className={cn(
                  "w-4 h-4 rounded-full transition-transform hover:scale-110 cursor-pointer",
                  item.strokeColor === c && "ring-2 ring-foreground ring-offset-1"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Delete button */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="p-1 bg-card/95 rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
