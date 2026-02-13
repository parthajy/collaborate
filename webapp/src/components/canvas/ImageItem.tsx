import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2, ImageIcon, RefreshCw } from "lucide-react";

interface ImageItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function ImageItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: ImageItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // Reset error state when URL changes
  useEffect(() => {
    setImageError(false);
    setIsLoading(true);
  }, [item.url]);

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

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        width: item.width || 300,
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
        height: Math.max(80, resizeStart.current.height + dy),
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

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
  }, []);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setImageError(false);
    setIsLoading(true);
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete();
    },
    [onDelete]
  );

  return (
    <div
      className={cn(
        "absolute rounded-lg cursor-grab select-none overflow-hidden bg-muted",
        isDragging && "dragging cursor-grabbing",
        !isDragging && "canvas-item",
        isSelected && "selected-ring"
      )}
      style={{
        left: localPos.x,
        top: localPos.y,
        width: item.width || 300,
        height: item.height || 200,
        zIndex: item.zIndex || 0,
      }}
      onMouseDown={handleMouseDown}
    >
      {item.url && !imageError ? (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="animate-pulse text-muted-foreground">
                <ImageIcon className="w-8 h-8" />
              </div>
            </div>
          )}
          <img
            src={item.url}
            alt={item.content || "Image"}
            className={cn(
              "w-full h-full object-cover transition-opacity",
              isLoading ? "opacity-0" : "opacity-100"
            )}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
          />
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
          <ImageIcon className="w-12 h-12 opacity-50" />
          <span className="text-sm">{imageError ? "Failed to load" : "No image"}</span>
          {imageError && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {isSelected && !isDragging && (
        <div
          className="absolute top-1 right-1 flex items-center gap-1 pointer-events-auto"
          style={{ zIndex: 10 }}
        >
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
          className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize bg-primary/80 rounded-full"
        />
      )}
    </div>
  );
}
