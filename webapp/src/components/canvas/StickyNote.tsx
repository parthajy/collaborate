import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { STICKY_COLORS } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface StickyNoteProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function StickyNote({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [content, setContent] = useState(item.content || "");
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
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

  // Drag handling
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing || isResizing) return;
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
    [isEditing, isResizing, item.x, item.y, onSelect, onDragStart]
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

  // Resize handling
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        width: item.width || 200,
        height: item.height || 200,
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
        width: Math.max(100, resizeStart.current.width + dx),
        height: Math.max(100, resizeStart.current.height + dy),
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

  // Double-click to edit
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // Save on blur
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (content !== item.content) {
      onUpdate({ content });
    }
  }, [content, item.content, onUpdate]);

  // Color picker
  const handleColorChange = useCallback(
    (e: React.MouseEvent, color: string) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Changing color to:", color);
      onUpdate({ color });
    },
    [onUpdate]
  );

  // Handle delete click
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Delete clicked for item:", item.id);
      onDelete();
    },
    [onDelete, item.id]
  );

  return (
    <div
      className={cn(
        "absolute rounded-lg cursor-grab select-none",
        isDragging && "dragging cursor-grabbing",
        !isDragging && "canvas-item",
        isSelected && "selected-ring"
      )}
      style={{
        left: localPos.x,
        top: localPos.y,
        width: item.width || 200,
        height: item.height || 200,
        backgroundColor: item.color || STICKY_COLORS[0].value,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content */}
      <div className="sticky-note absolute inset-0 p-4 pb-6 overflow-hidden">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            className="w-full h-full bg-transparent resize-none outline-none text-foreground/90 text-sm leading-relaxed"
            placeholder="Write something..."
          />
        ) : (
          <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content || "Double-click to edit"}
          </p>
        )}
      </div>

      {/* Creator name */}
      {item.createdBy && (
        <div className="absolute bottom-1 left-2 text-[10px] text-foreground/40 truncate max-w-[calc(100%-1rem)]">
          {item.createdBy}
        </div>
      )}

      {/* Controls (visible when selected) - positioned inside top area */}
      {isSelected && !isDragging && (
        <div
          className="absolute top-2 right-2 left-2 flex justify-between items-start pointer-events-auto"
          style={{ zIndex: 10 }}
        >
          {/* Color picker */}
          <div className="flex gap-1 bg-card/95 p-1 rounded-md shadow-md border border-border">
            {STICKY_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => handleColorChange(e, c.value)}
                className={cn(
                  "w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer",
                  item.color === c.value && "ring-2 ring-foreground ring-offset-1"
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          {/* Delete button */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="p-1.5 bg-card/95 rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Resize handle */}
      {isSelected && !isDragging && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        >
          <svg
            viewBox="0 0 16 16"
            className="w-full h-full text-foreground/30"
          >
            <path
              fill="currentColor"
              d="M14 14H12V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14Z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
