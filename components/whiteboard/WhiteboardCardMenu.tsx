"use client";

import { useCallback, useRef, useState } from "react";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";
import { cn } from "@/lib/cn";
import type { Whiteboard } from "@/lib/whiteboard/types";

export function WhiteboardCardMenu({
  board,
  duplicating,
  onDuplicate,
  onDelete,
}: {
  board: Whiteboard;
  duplicating: boolean;
  onDuplicate: (board: Whiteboard) => void;
  onDelete: (board: Whiteboard) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const canDelete = board.myRole === "ADMIN";
  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    triggerRef,
    menuOpen,
    90,
    { minWidth: 168 },
  );
  const close = useCallback(() => setMenuOpen(false), []);
  useFloatingClickOutside(menuOpen, close, triggerRef, menuRef);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Board actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!menuOpen) precomputeStyle();
          setMenuOpen((open) => !open);
        }}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border border-glass bg-glass-button text-primary/60 transition hover:border-accent/40 hover:text-accent",
          menuOpen && "border-accent/40 text-accent",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <FloatingMenuPortal
        isOpen={menuOpen}
        triggerRef={triggerRef}
        menuRef={menuRef}
        style={style}
        role="menu"
        className="overflow-hidden rounded-xl border border-glass bg-sidebar p-1 shadow-xl shadow-black/40 backdrop-blur-2xl"
      >
        <button
          type="button"
          role="menuitem"
          disabled={duplicating}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(false);
            onDuplicate(board);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent disabled:opacity-50"
        >
          <Copy className="size-3.5 shrink-0" />
          {duplicating ? "Copying…" : "Duplicate"}
        </button>
        {canDelete ? (
          <>
            <div className="my-1 h-px bg-glass-border" />
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                onDelete(board);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10 light:text-red-600"
            >
              <Trash2 className="size-3.5 shrink-0" />
              Delete
            </button>
          </>
        ) : null}
      </FloatingMenuPortal>
    </>
  );
}
