import { useState } from "react";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UserSettingsProps {
  name: string;
  color: string;
  colors: string[];
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
}

export function UserSettings({
  name,
  color,
  colors,
  onNameChange,
  onColorChange,
}: UserSettingsProps) {
  const [editName, setEditName] = useState(name);
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    onNameChange(editName);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setEditName(name);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 relative"
            >
              <User className="h-5 w-5" />
              <div
                className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-background"
                style={{ backgroundColor: color }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Set your name</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72" side="top">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Your Name</label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter your name..."
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="flex-1"
              />
              <Button onClick={handleSave} size="sm">
                Save
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Cursor Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-transform hover:scale-110",
                    color === c && "ring-2 ring-foreground ring-offset-2"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your name will appear on items you create.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
