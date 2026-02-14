import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { spaceApi, type ShapeType } from "@/lib/space-api";
import { useCanvas } from "@/hooks/use-canvas";
import { useLocalUser } from "@/hooks/use-local-user";
import { Canvas } from "@/components/canvas/Canvas";
import { Toolbar } from "@/components/canvas/Toolbar";
import { UserSettings } from "@/components/canvas/UserSettings";
import { Button } from "@/components/ui/button";
import { useRef, useState, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";

export default function Space() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const {
    data: space,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["space", slug],
    queryFn: () => spaceApi.getOrCreate(slug!),
    enabled: !!slug,
    retry: false,
  });

  if (!slug) {
    navigate("/");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading space...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Invalid Space Name</h1>
          <p className="text-muted-foreground mb-6">
            Space names must be 3-50 characters and contain only lowercase
            letters, numbers, and hyphens.
          </p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (!space) {
    return null;
  }

  return <SpaceCanvas slug={slug} initialItems={space.items} />;
}

function SpaceCanvas({
  slug,
  initialItems,
}: {
  slug: string;
  initialItems: ReturnType<typeof useCanvas>["items"];
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isGridSnap, setIsGridSnap] = useState(false);
  const [drawingColor] = useState("#000000");
  const [drawingWidth] = useState(3);

  // Local user for name/cursor
  const { name: userName, color: userColor, setName, setColor, colors } = useLocalUser();

  const {
    items,
    selectedId,
    setSelectedId,
    pan,
    zoom,
    cursors,
    notification,
    createItem,
    updateItem,
    deleteItem,
    bringToFront,
    resetSpace,
    handlePan,
    handleZoom,
    resetView,
    updateMyCursor,
  } = useCanvas({ slug, initialItems, userName, userColor });

  const handleAddItem = async (type: Parameters<typeof createItem>[0], shapeType?: string) => {
    const item = await createItem(type, shapeType ? { shapeType: shapeType as ShapeType } : undefined);
    return item;
  };

  const handleAddImage = async (url: string) => {
    const item = await createItem("image", { url });
    return item;
  };

  const handleAddEmoji = async (emoji: string) => {
    const item = await createItem("emoji", { content: emoji });
    return item;
  };

  const handleAddLink = async () => {
    await createItem("link");
  };

  const handleAddTable = async () => {
    // Create a 3x3 table by default
    const tableData = Array(3).fill(null).map(() =>
      Array(3).fill(null).map(() => ({ value: "" }))
    );
    await createItem("table", {
      content: JSON.stringify(tableData),
    });
  };

  const handleAddConnector = async (connectorType: "straight" | "elbow" | "curved") => {
    await createItem("connector", {
      connectorType,
    });
  };

  // Quick connect from shape - creates a connector starting from a shape's connection point
  const handleQuickConnect = useCallback(
    async (startPoint: { x: number; y: number }) => {
      // Create a connector starting from the given point
      // End point is offset by 100px to the right by default
      const endX = startPoint.x + 100;
      const endY = startPoint.y;

      await createItem("connector", {
        connectorType: "straight",
        position: { x: Math.min(startPoint.x, endX) - 20, y: Math.min(startPoint.y, endY) - 20 },
      });
    },
    [createItem]
  );

  const handleAddLocalImage = async (file: File) => {
    // Convert file to data URL for local storage
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        await createItem("image", { url: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  };

  // Double-click on canvas creates sticky note at position
  const handleDoubleClick = useCallback(
    async (position: { x: number; y: number }) => {
      await createItem("sticky", { position });
    },
    [createItem]
  );

  // Cursor tracking
  const handleCursorMove = useCallback(
    (x: number, y: number) => {
      updateMyCursor(x, y);
    },
    [updateMyCursor]
  );

  // Drawing mode
  const handleToggleDrawingMode = useCallback(() => {
    setIsDrawingMode((prev) => !prev);
    setIsPanMode(false);
    setSelectedId(null);
  }, [setSelectedId]);

  // Pan mode
  const handleTogglePanMode = useCallback(() => {
    setIsPanMode((prev) => !prev);
    setIsDrawingMode(false);
    setSelectedId(null);
  }, [setSelectedId]);

  // Grid snap toggle
  const handleToggleGridSnap = useCallback(() => {
    setIsGridSnap((prev) => !prev);
  }, []);

  // Drawing handlers
  const handleDrawingEnd = useCallback(
    async (points: Array<{ x: number; y: number }>) => {
      if (points.length < 2) return;

      // Find bounding box
      let minX = Infinity,
        minY = Infinity;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
      }

      // Normalize points relative to position
      const normalizedPoints = points.map((p) => ({
        x: p.x - minX,
        y: p.y - minY,
      }));

      await createItem("drawing", {
        position: { x: minX, y: minY },
        points: normalizedPoints,
        strokeColor: drawingColor,
        strokeWidth: drawingWidth,
      });
    },
    [createItem, drawingColor, drawingWidth]
  );

  // Export canvas as PNG
  const handleExportPNG = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const exportCanvas = await html2canvas(canvas, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });

      const link = document.createElement("a");
      link.download = `${slug}-collaborate.png`;
      link.href = exportCanvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to export PNG:", error);
    }
  }, [slug]);

  // Keyboard delete support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected item with Delete or Backspace key
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        // Don't delete if user is typing in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        deleteItem(selectedId);
      }
      // Escape to deselect
      if (e.key === "Escape") {
        setSelectedId(null);
        if (isDrawingMode) {
          setIsDrawingMode(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteItem, setSelectedId, isDrawingMode]);

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 px-4 py-3 flex items-center justify-between pointer-events-none">
        <Link
          to="/"
          className="flex items-center gap-2 pointer-events-auto hover:opacity-80 transition-opacity"
        >
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-semibold">Collaborate</span>
        </Link>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <UserSettings
            name={userName}
            color={userColor}
            colors={colors}
            onNameChange={setName}
            onColorChange={setColor}
          />
        </div>
      </header>

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-card border border-border rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      {/* Canvas */}
      <Canvas
        items={items}
        selectedId={selectedId}
        pan={pan}
        zoom={zoom}
        cursors={cursors}
        isDrawingMode={isDrawingMode}
        isPanMode={isPanMode}
        isGridSnap={isGridSnap}
        drawingColor={drawingColor}
        drawingWidth={drawingWidth}
        onSelect={setSelectedId}
        onPan={handlePan}
        onZoom={handleZoom}
        onItemUpdate={updateItem}
        onItemDelete={deleteItem}
        onBringToFront={bringToFront}
        onDoubleClick={handleDoubleClick}
        onCursorMove={handleCursorMove}
        onDrawingEnd={handleDrawingEnd}
        onQuickConnect={handleQuickConnect}
        canvasRef={canvasRef}
      />

      {/* Toolbar */}
      <Toolbar
        slug={slug}
        zoom={zoom}
        isDrawingMode={isDrawingMode}
        isPanMode={isPanMode}
        isGridSnap={isGridSnap}
        onAddItem={handleAddItem}
        onAddImage={handleAddImage}
        onAddEmoji={handleAddEmoji}
        onAddLink={handleAddLink}
        onAddTable={handleAddTable}
        onAddConnector={handleAddConnector}
        onAddLocalImage={handleAddLocalImage}
        onZoomIn={() => handleZoom(0.1)}
        onZoomOut={() => handleZoom(-0.1)}
        onResetView={resetView}
        onResetSpace={resetSpace}
        onToggleDrawingMode={handleToggleDrawingMode}
        onTogglePanMode={handleTogglePanMode}
        onToggleGridSnap={handleToggleGridSnap}
        onExportPNG={handleExportPNG}
      />
    </div>
  );
}
