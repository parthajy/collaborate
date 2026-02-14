import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface ConnectorItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

type DragTarget = "start" | "end" | "line" | null;

export function ConnectorItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: ConnectorItemProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [localStart, setLocalStart] = useState(item.startPoint || { x: 0, y: 0 });
  const [localEnd, setLocalEnd] = useState(item.endPoint || { x: 100, y: 100 });
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0, endX: 0, endY: 0 });
  const rafRef = useRef<number | null>(null);

  const startPoint = item.startPoint || { x: 0, y: 0 };
  const endPoint = item.endPoint || { x: 100, y: 100 };
  const connectorType = item.connectorType || "straight";
  const arrowEnd = item.arrowEnd !== false;
  const arrowStart = item.arrowStart || false;
  const strokeColor = item.strokeColor || "#64748b";
  const strokeWidth = item.strokeWidth || 2;

  // Sync from props when not dragging
  useEffect(() => {
    if (!dragTarget) {
      setLocalStart(item.startPoint || { x: 0, y: 0 });
      setLocalEnd(item.endPoint || { x: 100, y: 100 });
    }
  }, [item.startPoint, item.endPoint, dragTarget]);

  // Calculate path
  const getPath = () => {
    const start = localStart;
    const end = localEnd;

    if (connectorType === "straight") {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    if (connectorType === "elbow") {
      const midX = (start.x + end.x) / 2;
      return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }

    if (connectorType === "curved") {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const cx1 = start.x + dx * 0.5;
      const cy1 = start.y;
      const cx2 = end.x - dx * 0.5;
      const cy2 = end.y;
      return `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;
    }

    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  };

  // Arrow marker
  const getArrowAngle = (fromX: number, fromY: number, toX: number, toY: number) => {
    return Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI);
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, target: DragTarget) => {
      e.stopPropagation();
      onSelect();
      setDragTarget(target);
      onDragStart();
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: localStart.x,
        startY: localStart.y,
        endX: localEnd.x,
        endY: localEnd.y,
      };
    },
    [localStart, localEnd, onSelect, onDragStart]
  );

  useEffect(() => {
    if (!dragTarget) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;

      if (dragTarget === "start") {
        const newStart = {
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        };
        setLocalStart(newStart);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          onUpdate({ startPoint: newStart });
        });
      } else if (dragTarget === "end") {
        const newEnd = {
          x: dragStartRef.current.endX + dx,
          y: dragStartRef.current.endY + dy,
        };
        setLocalEnd(newEnd);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          onUpdate({ endPoint: newEnd });
        });
      } else if (dragTarget === "line") {
        const newStart = {
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        };
        const newEnd = {
          x: dragStartRef.current.endX + dx,
          y: dragStartRef.current.endY + dy,
        };
        setLocalStart(newStart);
        setLocalEnd(newEnd);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          onUpdate({ startPoint: newStart, endPoint: newEnd });
        });
      }
    };

    const handleMouseUp = () => {
      setDragTarget(null);
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
  }, [dragTarget, zoom, onUpdate, onDragEnd]);

  // Calculate bounding box
  const minX = Math.min(localStart.x, localEnd.x) - 20;
  const minY = Math.min(localStart.y, localEnd.y) - 20;
  const maxX = Math.max(localStart.x, localEnd.x) + 20;
  const maxY = Math.max(localStart.y, localEnd.y) + 20;
  const width = maxX - minX;
  const height = maxY - minY;

  // Offset points for SVG viewBox
  const svgStart = { x: localStart.x - minX, y: localStart.y - minY };
  const svgEnd = { x: localEnd.x - minX, y: localEnd.y - minY };

  const getSvgPath = () => {
    if (connectorType === "straight") {
      return `M ${svgStart.x} ${svgStart.y} L ${svgEnd.x} ${svgEnd.y}`;
    }
    if (connectorType === "elbow") {
      const midX = (svgStart.x + svgEnd.x) / 2;
      return `M ${svgStart.x} ${svgStart.y} L ${midX} ${svgStart.y} L ${midX} ${svgEnd.y} L ${svgEnd.x} ${svgEnd.y}`;
    }
    if (connectorType === "curved") {
      const dx = svgEnd.x - svgStart.x;
      const cx1 = svgStart.x + dx * 0.5;
      const cy1 = svgStart.y;
      const cx2 = svgEnd.x - dx * 0.5;
      const cy2 = svgEnd.y;
      return `M ${svgStart.x} ${svgStart.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${svgEnd.x} ${svgEnd.y}`;
    }
    return `M ${svgStart.x} ${svgStart.y} L ${svgEnd.x} ${svgEnd.y}`;
  };

  const toggleConnectorType = () => {
    const types: Array<"straight" | "elbow" | "curved"> = ["straight", "elbow", "curved"];
    const currentIndex = types.indexOf(connectorType);
    const nextType = types[(currentIndex + 1) % types.length];
    onUpdate({ connectorType: nextType });
  };

  return (
    <div
      className={cn(
        "absolute pointer-events-none",
        isSelected && "z-50"
      )}
      style={{
        left: minX,
        top: minY,
        width,
        height,
        zIndex: item.zIndex || 0,
      }}
    >
      <svg
        width={width}
        height={height}
        className="overflow-visible"
      >
        <defs>
          <marker
            id={`arrowhead-end-${item.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={strokeColor}
            />
          </marker>
          <marker
            id={`arrowhead-start-${item.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="1"
            refY="3.5"
            orient="auto-start-reverse"
          >
            <polygon
              points="10 0, 0 3.5, 10 7"
              fill={strokeColor}
            />
          </marker>
        </defs>

        {/* Hit area (wider, invisible) */}
        <path
          d={getSvgPath()}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(strokeWidth + 10, 20)}
          className="pointer-events-auto cursor-move"
          onMouseDown={(e) => handleMouseDown(e, "line")}
        />

        {/* Visible line */}
        <path
          d={getSvgPath()}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={arrowEnd ? `url(#arrowhead-end-${item.id})` : undefined}
          markerStart={arrowStart ? `url(#arrowhead-start-${item.id})` : undefined}
          className={cn(
            "pointer-events-none",
            isSelected && "stroke-primary"
          )}
        />

        {/* Control points */}
        {isSelected && (
          <>
            <circle
              cx={svgStart.x}
              cy={svgStart.y}
              r={6}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={2}
              className="pointer-events-auto cursor-crosshair"
              onMouseDown={(e) => handleMouseDown(e, "start")}
            />
            <circle
              cx={svgEnd.x}
              cy={svgEnd.y}
              r={6}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={2}
              className="pointer-events-auto cursor-crosshair"
              onMouseDown={(e) => handleMouseDown(e, "end")}
            />
          </>
        )}
      </svg>

      {/* Controls */}
      {isSelected && !dragTarget && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-auto">
          <button
            onClick={toggleConnectorType}
            className="px-2 py-1.5 bg-card rounded-md shadow-md border border-border hover:bg-muted transition-colors text-xs font-medium"
          >
            {connectorType === "straight" ? "Straight" : connectorType === "elbow" ? "Elbow" : "Curved"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 bg-card rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
