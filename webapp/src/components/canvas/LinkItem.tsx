import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Link2, ExternalLink, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface LinkItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function LinkItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: LinkItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.url || item.content || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });

  // Update edit value when item changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(item.url || item.content || "");
    }
  }, [item.url, item.content, isEditing]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
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
      onUpdate({
        x: dragStart.current.itemX + dx,
        y: dragStart.current.itemY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, zoom, onUpdate, onDragEnd]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isEditing && !isDragging) {
        const url = item.url || item.content || "";
        if (url && url !== "https://") {
          const fullUrl = url.startsWith("http") ? url : `https://${url}`;
          window.open(fullUrl, "_blank", "noopener,noreferrer");
        }
      }
    },
    [isEditing, isDragging, item.url, item.content]
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    onUpdate({ url: editValue, content: editValue });
  }, [editValue, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleBlur();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditValue(item.url || item.content || "");
      }
    },
    [handleBlur, item.url, item.content]
  );

  // Extract display URL (domain only for cleanliness)
  const getDisplayUrl = () => {
    const url = item.url || item.content || "https://";
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname || url;
    } catch {
      return url;
    }
  };

  return (
    <div
      className={cn(
        "absolute select-none",
        !isEditing && "cursor-pointer",
        isDragging && "cursor-grabbing",
        isSelected && "selected-ring rounded-lg"
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.width || 280,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card shadow-sm transition-all",
          !isEditing && "hover:shadow-md hover:border-primary/50"
        )}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Link2 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Enter URL..."
              className="h-8 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {getDisplayUrl()}
              </span>
              <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </div>
          )}
        </div>
      </div>

      {isSelected && !isDragging && !isEditing && (
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
