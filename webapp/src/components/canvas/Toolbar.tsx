import { useCallback, useState, useRef } from "react";
import {
  StickyNote,
  Type,
  Square,
  Image,
  Share2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Home,
  Circle,
  Triangle,
  Diamond,
  Smile,
  Star,
  Hexagon,
  ArrowRight,
  Minus,
  Pencil,
  Link2,
  Download,
  Hand,
  MousePointer2,
  Table,
  MoveRight,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CanvasItem } from "@/lib/space-api";

interface ToolbarProps {
  slug: string;
  zoom: number;
  isDrawingMode?: boolean;
  isPanMode?: boolean;
  onAddItem: (type: CanvasItem["type"], shapeType?: string) => void;
  onAddImage: (url: string) => void;
  onAddEmoji: (emoji: string) => void;
  onAddLink: () => void;
  onAddTable: () => void;
  onAddConnector: (connectorType: "straight" | "elbow" | "curved") => void;
  onAddLocalImage: (file: File) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onResetSpace: () => void;
  onToggleDrawingMode?: () => void;
  onTogglePanMode?: () => void;
  onExportPNG?: () => void;
}

const SHAPE_OPTIONS = [
  { type: "rectangle", icon: Square, label: "Rectangle" },
  { type: "circle", icon: Circle, label: "Circle" },
  { type: "triangle", icon: Triangle, label: "Triangle" },
  { type: "diamond", icon: Diamond, label: "Diamond" },
  { type: "star", icon: Star, label: "Star" },
  { type: "hexagon", icon: Hexagon, label: "Hexagon" },
  { type: "arrow", icon: ArrowRight, label: "Arrow" },
  { type: "line", icon: Minus, label: "Line" },
];

const EMOJI_OPTIONS = ["✨", "💡", "🎯", "🚀", "❤️", "👍", "⭐", "🔥", "💬", "📌", "✅", "❓"];

export function Toolbar({
  slug,
  zoom,
  isDrawingMode = false,
  isPanMode = false,
  onAddItem,
  onAddImage,
  onAddEmoji,
  onAddLink,
  onAddTable,
  onAddConnector,
  onAddLocalImage,
  onZoomIn,
  onZoomOut,
  onResetView,
  onResetSpace,
  onToggleDrawingMode,
  onTogglePanMode,
  onExportPNG,
}: ToolbarProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onAddLocalImage(file);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onAddLocalImage]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleAddImage = useCallback(() => {
    if (imageUrl.trim()) {
      onAddImage(imageUrl.trim());
      setImageUrl("");
    }
  }, [imageUrl, onAddImage]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="toolbar-glass rounded-2xl shadow-xl flex items-center gap-1 p-2">
        {/* Add items */}
        <div className="flex items-center gap-1 pr-2 border-r border-border">
          <ToolbarButton
            icon={StickyNote}
            label="Add sticky note"
            onClick={() => onAddItem("sticky")}
          />
          <ToolbarButton
            icon={Type}
            label="Add text"
            onClick={() => onAddItem("text")}
          />

          {/* Shape picker */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <Square className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add shape</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-2" side="top">
              <div className="grid grid-cols-4 gap-1">
                {SHAPE_OPTIONS.map(({ type, icon: Icon, label }) => (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => onAddItem("shape", type)}
                      >
                        <Icon className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Image URL input */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <Image className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add image</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-80" side="top">
              <div className="space-y-2">
                <p className="text-sm font-medium">Add image from URL</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddImage()}
                  />
                  <Button onClick={handleAddImage} disabled={!imageUrl.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Emoji picker */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add emoji</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-2" side="top">
              <div className="grid grid-cols-6 gap-1">
                {EMOJI_OPTIONS.map((emoji) => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-xl"
                    onClick={() => onAddEmoji(emoji)}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Drawing tool */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isDrawingMode ? "default" : "ghost"}
                size="icon"
                className={cn("h-10 w-10", isDrawingMode && "bg-primary text-primary-foreground")}
                onClick={onToggleDrawingMode}
              >
                <Pencil className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isDrawingMode ? "Exit drawing mode" : "Freehand draw"}</TooltipContent>
          </Tooltip>

          {/* Pan/Hand tool */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPanMode ? "default" : "ghost"}
                size="icon"
                className={cn("h-10 w-10", isPanMode && "bg-primary text-primary-foreground")}
                onClick={onTogglePanMode}
              >
                {isPanMode ? <Hand className="h-5 w-5" /> : <MousePointer2 className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPanMode ? "Exit pan mode (select)" : "Pan mode (hand)"}</TooltipContent>
          </Tooltip>

          {/* Link tool */}
          <ToolbarButton
            icon={Link2}
            label="Add link"
            onClick={onAddLink}
          />

          {/* Table tool */}
          <ToolbarButton
            icon={Table}
            label="Add table"
            onClick={onAddTable}
          />

          {/* Connector/Arrow tool */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10">
                    <MoveRight className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add connector</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-2" side="top">
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onAddConnector("straight")}
                >
                  Straight Arrow
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onAddConnector("elbow")}
                >
                  Elbow Arrow
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onAddConnector("curved")}
                >
                  Curved Arrow
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Upload local image */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload image</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 px-2 border-r border-border">
          <ToolbarButton icon={ZoomOut} label="Zoom out" onClick={onZoomOut} />
          <span className="text-sm text-muted-foreground w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <ToolbarButton icon={ZoomIn} label="Zoom in" onClick={onZoomIn} />
          <ToolbarButton
            icon={Home}
            label="Reset view"
            onClick={onResetView}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pl-2">
          {/* Export PNG */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={onExportPNG}
              >
                <Download className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export as PNG</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-10 w-10", copied && "text-green-500")}
                onClick={handleShare}
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied!" : "Copy link"}
            </TooltipContent>
          </Tooltip>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:text-destructive"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Reset board</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset this board?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all items on the board. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onResetSpace}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Space name badge */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-card/80 backdrop-blur-sm rounded-full border border-border text-sm text-muted-foreground">
        /{slug}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onClick}>
          <Icon className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
