"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_COLOR_LABEL, NOTE_COLORS, NOTE_SWATCH, type NoteColor } from "@/lib/notes";

export function ColorDots({
  value,
  onChange,
  size = "md",
  allowClear = false,
}: {
  value: NoteColor | null;
  onChange: (color: NoteColor | null) => void;
  size?: "sm" | "md";
  /** Clicking the active colour clears it (used for the board filter). */
  allowClear?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Note colour">
      {NOTE_COLORS.map((color) => {
        const active = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={NOTE_COLOR_LABEL[color]}
            title={NOTE_COLOR_LABEL[color]}
            onClick={() => onChange(active && allowClear ? null : color)}
            className={cn(
              "flex items-center justify-center rounded-full ring-offset-2 ring-offset-transparent transition hover:scale-110",
              size === "sm" ? "size-4" : "size-6",
              NOTE_SWATCH[color],
              active && "ring-2 ring-primary/70",
            )}
          >
            {active ? (
              <Check className={cn("text-black/70", size === "sm" ? "size-2.5" : "size-3.5")} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
