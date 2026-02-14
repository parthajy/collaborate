import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { snapToGrid } from "@/lib/shape-utils";

interface ShapeItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  isGridSnap?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onQuickConnect?: (fromPoint: { x: number; y: number; side: string }) => void;
}

const SHAPE_COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
];

export function ShapeItem({
  item,
  isSelected,
  zoom,
  isGridSnap = false,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onQuickConnect,
}: ShapeItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // Sync position from props when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: item.x, y: item.y });
    }
  }, [item.x, item.y, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing) return;
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
    [isResizing, item.x, item.y, onSelect, onDragStart]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      let newX = dragStart.current.itemX + dx;
      let newY = dragStart.current.itemY + dy;

      // Apply grid snap if enabled
      if (isGridSnap) {
        const snapped = snapToGrid({ x: newX, y: newY });
        newX = snapped.x;
        newY = snapped.y;
      }

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
  }, [isDragging, zoom, onUpdate, onDragEnd, isGridSnap]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        width: item.width || 100,
        height: item.height || 100,
        x: e.clientX,
        y: e.clientY,
      };
    },
    [item.width, item.height]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - resizeStart.current.x) / zoom;
      const dy = (e.clientY - resizeStart.current.y) / zoom;
      onUpdate({
        width: Math.max(40, resizeStart.current.width + dx),
        height: Math.max(40, resizeStart.current.height + dy),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, zoom, onUpdate]);

  // Handle color change
  const handleColorChange = useCallback(
    (e: React.MouseEvent, color: string) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Changing shape color to:", color);
      onUpdate({ color });
    },
    [onUpdate]
  );

  // Handle delete click
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Delete clicked for shape:", item.id);
      onDelete();
    },
    [onDelete, item.id]
  );

  const renderShape = () => {
    const width = item.width || 100;
    const height = item.height || 100;
    const color = item.color || SHAPE_COLORS[0];

    switch (item.shapeType) {
      case "circle":
        return (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={width / 2 - 2}
            ry={height / 2 - 2}
            fill={color}
            opacity={0.8}
          />
        );
      case "triangle":
        return (
          <polygon
            points={`${width / 2},4 ${width - 4},${height - 4} 4,${height - 4}`}
            fill={color}
            opacity={0.8}
          />
        );
      case "diamond":
        return (
          <polygon
            points={`${width / 2},4 ${width - 4},${height / 2} ${width / 2},${height - 4} 4,${height / 2}`}
            fill={color}
            opacity={0.8}
          />
        );
      case "star": {
        // 5-pointed star
        const cx = width / 2;
        const cy = height / 2;
        const outerR = Math.min(width, height) / 2 - 4;
        const innerR = outerR * 0.4;
        const points: string[] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / 2) + (i * Math.PI / 5);
          points.push(`${cx + r * Math.cos(angle)},${cy - r * Math.sin(angle)}`);
        }
        return (
          <polygon
            points={points.join(" ")}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "hexagon": {
        // Regular hexagon
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - 4;
        const points: string[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 6) + (i * Math.PI / 3);
          points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
        }
        return (
          <polygon
            points={points.join(" ")}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "arrow": {
        // Right-pointing arrow
        const arrowHeadWidth = Math.min(width * 0.4, 40);
        const arrowBodyHeight = height * 0.4;
        const bodyTop = (height - arrowBodyHeight) / 2;
        const bodyBottom = bodyTop + arrowBodyHeight;
        const bodyRight = width - arrowHeadWidth;
        return (
          <polygon
            points={`4,${bodyTop} ${bodyRight},${bodyTop} ${bodyRight},4 ${width - 4},${height / 2} ${bodyRight},${height - 4} ${bodyRight},${bodyBottom} 4,${bodyBottom}`}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "line": {
        // Diagonal line
        return (
          <line
            x1={4}
            y1={height - 4}
            x2={width - 4}
            y2={4}
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.8}
          />
        );
      }
      // Flowchart shapes
      case "terminator": {
        // Rounded rectangle (pill shape) for start/end
        const radius = Math.min(width, height) / 2 - 4;
        return (
          <rect
            x={4}
            y={4}
            width={width - 8}
            height={height - 8}
            rx={radius}
            ry={radius}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "process": {
        // Simple rectangle for process steps (sharper corners than default)
        return (
          <rect
            x={4}
            y={4}
            width={width - 8}
            height={height - 8}
            rx={4}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "decision": {
        // Diamond shape (same as existing diamond but slightly different)
        return (
          <polygon
            points={`${width / 2},4 ${width - 4},${height / 2} ${width / 2},${height - 4} 4,${height / 2}`}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "data": {
        // Parallelogram for input/output
        const skew = width * 0.15;
        return (
          <polygon
            points={`${skew + 4},4 ${width - 4},4 ${width - skew - 4},${height - 4} 4,${height - 4}`}
            fill={color}
            opacity={0.8}
          />
        );
      }
      case "document": {
        // Document shape with wavy bottom
        const waveHeight = height * 0.15;
        return (
          <path
            d={`
              M 4 4
              L ${width - 4} 4
              L ${width - 4} ${height - waveHeight - 4}
              Q ${width * 0.75} ${height - 4}, ${width / 2} ${height - waveHeight - 4}
              Q ${width * 0.25} ${height - waveHeight * 2 - 4}, 4 ${height - waveHeight - 4}
              Z
            `}
            fill={color}
            opacity={0.8}
          />
        );
      }
      default: // rectangle
        return (
          <rect
            x={2}
            y={2}
            width={width - 4}
            height={height - 4}
            rx={8}
            fill={color}
            opacity={0.8}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        "absolute cursor-grab select-none",
        isDragging && "dragging cursor-grabbing",
        !isDragging && "canvas-item",
        isSelected && "selected-ring rounded-lg"
      )}
      style={{
        left: localPos.x,
        top: localPos.y,
        width: item.width || 100,
        height: item.height || 100,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <svg
        width={item.width || 100}
        height={item.height || 100}
        className="drop-shadow-md pointer-events-none"
      >
        {renderShape()}
      </svg>

      {/* Controls - positioned inside */}
      {isSelected && !isDragging && (
        <div
          className="absolute top-1 right-1 left-1 flex justify-between items-start pointer-events-auto"
          style={{ zIndex: 10 }}
        >
          {/* Color picker */}
          <div className="flex gap-0.5 bg-card/95 p-1 rounded-md shadow-md border border-border">
            {SHAPE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleColorChange(e, c)}
                className={cn(
                  "w-4 h-4 rounded-full transition-transform hover:scale-110 cursor-pointer",
                  item.color === c && "ring-2 ring-foreground ring-offset-1"
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

      {/* Resize handle */}
      {isSelected && !isDragging && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-primary rounded-full opacity-80"
        />
      )}

      {/* Quick-connect handles - show on hover or selection */}
      {(isSelected || isHovered) && !isDragging && onQuickConnect && (
        <>
          {/* Top */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-crosshair hover:scale-125 transition-transform"
            onMouseDown={(e) => {
              e.stopPropagation();
              const width = item.width || 100;
              onQuickConnect({
                x: localPos.x + width / 2,
                y: localPos.y,
                side: "top",
              });
            }}
          />
          {/* Right */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-crosshair hover:scale-125 transition-transform"
            onMouseDown={(e) => {
              e.stopPropagation();
              const width = item.width || 100;
              const height = item.height || 100;
              onQuickConnect({
                x: localPos.x + width,
                y: localPos.y + height / 2,
                side: "right",
              });
            }}
          />
          {/* Bottom */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-crosshair hover:scale-125 transition-transform"
            onMouseDown={(e) => {
              e.stopPropagation();
              const width = item.width || 100;
              const height = item.height || 100;
              onQuickConnect({
                x: localPos.x + width / 2,
                y: localPos.y + height,
                side: "bottom",
              });
            }}
          />
          {/* Left */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-crosshair hover:scale-125 transition-transform"
            onMouseDown={(e) => {
              e.stopPropagation();
              const height = item.height || 100;
              onQuickConnect({
                x: localPos.x,
                y: localPos.y + height / 2,
                side: "left",
              });
            }}
          />
        </>
      )}
    </div>
  );
}
