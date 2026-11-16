"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { newChecklistItem, type ChecklistItem } from "@/lib/notes";

export function ChecklistEditor({
  items,
  onChange,
  compact = false,
  showAdd = true,
  autoFocus = false,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  compact?: boolean;
  showAdd?: boolean;
  /** Put the cursor in the last item when the list first appears. */
  autoFocus?: boolean;
}) {
  const [focusId, setFocusId] = useState<string | null>(() =>
    autoFocus ? (items[items.length - 1]?.id ?? null) : null,
  );

  function update(id: string, patch: Partial<ChecklistItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addAfter(index: number) {
    const next = newChecklistItem();
    const copy = [...items];
    copy.splice(index + 1, 0, next);
    setFocusId(next.id);
    onChange(copy);
  }

  const done = items.filter((item) => item.done).length;

  return (
    <div className="space-y-1">
      {items.length > 0 && !compact ? (
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-primary/55">
            {done}/{items.length}
          </span>
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={item.id} className="group flex items-center gap-2">
          <button
            type="button"
            aria-label={item.done ? "Mark as not done" : "Mark as done"}
            onClick={() => update(item.id, { done: !item.done })}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md border border-primary/30 transition",
              compact ? "size-4" : "size-5",
              item.done && "border-accent bg-accent text-white",
            )}
          >
            {item.done ? <Check className={compact ? "size-3" : "size-3.5"} /> : null}
          </button>
          <input
            value={item.text}
            autoFocus={item.id === focusId}
            onChange={(event) => update(item.id, { text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (item.text.trim()) addAfter(index);
              }
              if (event.key === "Backspace" && !item.text) {
                event.preventDefault();
                onChange(items.filter((entry) => entry.id !== item.id));
              }
            }}
            placeholder="List item"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-primary/35",
              compact ? "py-0.5 text-sm" : "py-1 text-[15px]",
              item.done && "text-primary/45 line-through",
            )}
          />
          <button
            type="button"
            aria-label="Remove item"
            onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
            className="shrink-0 rounded-md p-1 text-primary/35 opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {showAdd ? (
        <button
          type="button"
          onClick={() => addAfter(items.length - 1)}
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold text-accent hover:underline",
            compact ? "pt-1 text-xs" : "pt-1 text-sm",
          )}
        >
          <Plus className="size-4" />
          Add item
        </button>
      ) : null}
    </div>
  );
}
