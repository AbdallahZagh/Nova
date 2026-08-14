"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WhiteboardPage } from "@/lib/whiteboard/types";

type WhiteboardPagesBarProps = {
  pages: WhiteboardPage[];
  pageId: string | null;
  canAdd: boolean;
  canDelete: boolean;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onDelete: (pageId: string) => void;
};

export function WhiteboardPagesBar({
  pages,
  pageId,
  canAdd,
  canDelete,
  onSelect,
  onAdd,
  onDelete,
}: WhiteboardPagesBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2 md:px-6">
      {pages.map((page, index) => {
        const active = page.id === pageId;
        return (
          <div key={page.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                active
                  ? "bg-accent text-white"
                  : "bg-glass-button text-primary/70 hover:text-primary",
              )}
            >
              Page {index + 1}
            </button>
            {canDelete && pages.length > 1 ? (
              <button
                type="button"
                title="Delete page"
                onClick={() => onDelete(page.id)}
                className="rounded-lg p-1 text-primary/35 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
      {canAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg bg-glass-button px-2.5 py-1.5 text-xs font-semibold text-primary/70 hover:text-accent"
        >
          <Plus className="size-3.5" />
          Page
        </button>
      ) : null}
    </div>
  );
}
