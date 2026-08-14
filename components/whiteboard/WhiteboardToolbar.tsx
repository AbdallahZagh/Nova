"use client";

import { useRef } from "react";
import { Eraser, Highlighter, Pen, Redo2, Trash2, Undo2 } from "lucide-react";
import { ColorPicker } from "@/components/whiteboard/ColorPicker";
import { ThicknessSlider } from "@/components/whiteboard/ThicknessSlider";
import { cn } from "@/lib/cn";
import { toHexColor, sameColor } from "@/lib/whiteboard/theme";
import {
  DEFAULT_TOOL_WIDTH,
  ERASER_WIDTH_MAX,
  ERASER_WIDTH_MIN,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  type StrokeTool,
} from "@/lib/whiteboard/types";

const TOOLS: { id: StrokeTool; label: string; icon: typeof Pen }[] = [
  { id: "pen", label: "Pen", icon: Pen },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

type WhiteboardToolbarProps = {
  tool: StrokeTool;
  color: string;
  width: number;
  colors: readonly string[];
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: StrokeTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
};

export function WhiteboardToolbar({
  tool,
  color,
  width,
  colors,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
  onClear,
}: WhiteboardToolbarProps) {
  const widthsRef = useRef<Record<StrokeTool, number>>({ ...DEFAULT_TOOL_WIDTH });
  widthsRef.current[tool] = width;
  const eraser = tool === "eraser";
  const min = eraser ? ERASER_WIDTH_MIN : STROKE_WIDTH_MIN;
  const max = eraser ? ERASER_WIDTH_MAX : STROKE_WIDTH_MAX;

  const handleTool = (next: StrokeTool) => {
    onToolChange(next);
    onWidthChange(widthsRef.current[next]);
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-glass bg-glass-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => handleTool(id)}
              className={cn(
                "rounded-xl p-2 transition",
                tool === id
                  ? "bg-accent/20 text-accent"
                  : "text-primary/70 hover:bg-glass-button hover:text-accent",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Undo"
            disabled={!canUndo}
            onClick={onUndo}
            className="rounded-xl p-2 text-primary/70 hover:bg-glass-button disabled:opacity-40"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            title="Redo"
            disabled={!canRedo}
            onClick={onRedo}
            className="rounded-xl p-2 text-primary/70 hover:bg-glass-button disabled:opacity-40"
          >
            <Redo2 className="size-4" />
          </button>
          <button
            type="button"
            title="Clear the whole board"
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            <Trash2 className="size-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-glass pt-2">
        {eraser ? null : (
          <div className="flex items-center gap-1.5">
            {colors.map((value, index) => {
              const selected = sameColor(value, color);
              return (
              <button
                key={`${value}-${index}`}
                type="button"
                title={value}
                onClick={() => onColorChange(toHexColor(value))}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition",
                  selected
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar"
                    : "ring-1 ring-glass",
                )}
              >
                <span
                  className="size-5 rounded-full border border-black/10"
                  style={{ backgroundColor: value }}
                />
              </button>
              );
            })}
            <ColorPicker color={color} onChange={onColorChange} />
          </div>
        )}

        <div className="flex min-w-56 flex-1 items-center gap-3">
          <span
            className="shrink-0 rounded-full"
            style={{
              width: Math.max(8, Math.min(28, width)),
              height: Math.max(8, Math.min(28, width)),
              backgroundColor: eraser ? "currentColor" : color,
              opacity: tool === "highlighter" ? 0.45 : 1,
            }}
          />
          <ThicknessSlider value={width} min={min} max={max} onChange={onWidthChange} />
          <span className="w-7 text-xs tabular-nums text-primary/55">{width}</span>
        </div>
      </div>
    </div>
  );
}
