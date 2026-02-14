import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface EmojiItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function EmojiItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: EmojiItemProps) {
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

      // Debounce the actual update with RAF
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

  return (
    <div
      className={cn(
        "absolute cursor-grab select-none",
        isDragging && "cursor-grabbing dragging",
        !isDragging && "canvas-item",
        isSelected && "selected-ring rounded-lg"
      )}
      style={{
        left: localPos.x,
        top: localPos.y,
        zIndex: item.zIndex || 0,
        fontSize: item.fontSize || 48,
      }}
      onMouseDown={handleMouseDown}
    >
      <span className="drop-shadow-md">{item.content || "✨"}</span>

      {isSelected && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-10 right-0 p-2 bg-card rounded-lg shadow-lg border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
