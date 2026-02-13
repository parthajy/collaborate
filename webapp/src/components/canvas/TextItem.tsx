import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface TextItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function TextItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: TextItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [content, setContent] = useState(item.content || "");
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setContent(item.content || "");
  }, [item.content]);

  // Sync position from props when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: item.x, y: item.y });
    }
  }, [item.x, item.y, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
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
    [isEditing, item.x, item.y, onSelect, onDragStart]
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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (content !== item.content) {
      onUpdate({ content });
    }
  }, [content, item.content, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleBlur();
      }
    },
    [handleBlur]
  );

  // Handle delete click
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Delete clicked for text:", item.id);
      onDelete();
    },
    [onDelete, item.id]
  );

  return (
    <div
      className={cn(
        "absolute bg-card/80 backdrop-blur-sm rounded-lg cursor-grab select-none px-4 py-2 border border-border",
        isDragging && "dragging cursor-grabbing",
        !isDragging && "canvas-item",
        isSelected && "selected-ring"
      )}
      style={{
        left: localPos.x,
        top: localPos.y,
        minWidth: 100,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-transparent outline-none text-foreground min-w-[100px]"
          style={{ fontSize: item.fontSize || 16 }}
        />
      ) : (
        <span
          className="text-foreground whitespace-nowrap"
          style={{ fontSize: item.fontSize || 16 }}
        >
          {content || "Double-click to edit"}
        </span>
      )}

      {isSelected && !isDragging && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          className="absolute top-1 right-1 p-1 bg-card/95 rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
