import { useState, useRef, useCallback, useEffect } from "react";
import type { CanvasItem } from "@/lib/space-api";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Minus } from "lucide-react";

interface TableCell {
  value: string;
}

interface TableItemProps {
  item: CanvasItem;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasItem>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function TableItem({
  item,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
}: TableItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState({ x: item.x, y: item.y });
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const dragStart = useRef({ x: 0, y: 0, itemX: 0, itemY: 0 });
  const rafRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = item.rows || 3;
  const cols = item.cols || 3;
  const tableData: TableCell[][] = item.tableData ||
    Array(rows).fill(null).map(() => Array(cols).fill(null).map(() => ({ value: "" })));

  // Sync position from props when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: item.x, y: item.y });
    }
  }, [item.x, item.y, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editingCell) return;
      // Don't start drag from buttons or inputs
      if ((e.target as HTMLElement).closest('button, input')) return;
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
    [editingCell, item.x, item.y, onSelect, onDragStart]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      const newX = dragStart.current.itemX + dx;
      const newY = dragStart.current.itemY + dy;

      setLocalPos({ x: newX, y: newY });

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

  const handleCellClick = useCallback((row: number, col: number) => {
    setEditingCell({ row, col });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    const newData = tableData.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? { value } : c))
    );
    onUpdate({ tableData: newData });
  }, [tableData, onUpdate]);

  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleAddRow = useCallback(() => {
    const newRow = Array(cols).fill(null).map(() => ({ value: "" }));
    const newData = [...tableData, newRow];
    onUpdate({ tableData: newData, rows: rows + 1 });
  }, [tableData, cols, rows, onUpdate]);

  const handleRemoveRow = useCallback(() => {
    if (rows <= 1) return;
    const newData = tableData.slice(0, -1);
    onUpdate({ tableData: newData, rows: rows - 1 });
  }, [tableData, rows, onUpdate]);

  const handleAddCol = useCallback(() => {
    const newData = tableData.map(row => [...row, { value: "" }]);
    onUpdate({ tableData: newData, cols: cols + 1 });
  }, [tableData, cols, onUpdate]);

  const handleRemoveCol = useCallback(() => {
    if (cols <= 1) return;
    const newData = tableData.map(row => row.slice(0, -1));
    onUpdate({ tableData: newData, cols: cols - 1 });
  }, [tableData, cols, onUpdate]);

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
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <table className="border-collapse">
          <tbody>
            {tableData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td
                    key={colIndex}
                    className="border border-border p-0 min-w-[80px]"
                    onClick={() => handleCellClick(rowIndex, colIndex)}
                  >
                    {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={cell.value}
                        onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                        onBlur={handleCellBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            handleCellBlur();
                          }
                          e.stopPropagation();
                        }}
                        className="w-full h-full px-2 py-1.5 text-sm bg-transparent outline-none border-2 border-primary"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="px-2 py-1.5 text-sm min-h-[32px] cursor-text hover:bg-muted/50">
                        {cell.value || <span className="text-muted-foreground/50">...</span>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controls */}
      {isSelected && !isDragging && (
        <>
          {/* Row controls */}
          <div className="absolute -right-10 top-1/2 -translate-y-1/2 flex flex-col gap-1">
            <button
              onClick={handleAddRow}
              className="p-1.5 bg-card rounded-md shadow-md border border-border hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={handleRemoveRow}
              disabled={rows <= 1}
              className="p-1.5 bg-card rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className="w-3 h-3" />
            </button>
          </div>

          {/* Column controls */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex gap-1">
            <button
              onClick={handleAddCol}
              className="p-1.5 bg-card rounded-md shadow-md border border-border hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={handleRemoveCol}
              disabled={cols <= 1}
              className="p-1.5 bg-card rounded-md shadow-md border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className="w-3 h-3" />
            </button>
          </div>

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-10 right-0 p-2 bg-card rounded-lg shadow-lg border border-border hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Creator name */}
      {item.createdBy && (
        <div className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground truncate max-w-full">
          {item.createdBy}
        </div>
      )}
    </div>
  );
}
