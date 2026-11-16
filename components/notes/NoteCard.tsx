"use client";

import { useState } from "react";
import { Check, Copy, FolderKanban, Monitor, Palette, Pin, Trash2, X } from "lucide-react";
import { ColorDots } from "@/components/notes/ColorDots";
import { useNoteActions } from "@/components/notes/useNoteActions";
import { cn } from "@/lib/cn";
import {
  checklistProgress,
  editedLabel,
  NOTE_SURFACE,
  noteTitle,
  type Note,
} from "@/lib/notes";

const VISIBLE_ITEMS = 5;

export function NoteCard({
  note,
  onOpen,
  onDelete,
}: {
  note: Note;
  onOpen: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const actions = useNoteActions();
  const [palette, setPalette] = useState(false);
  const hasTitle = Boolean(note.title?.trim());
  const hiddenItems = Math.max(0, note.checklist.length - VISIBLE_ITEMS);

  function stop(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(note);
        }
      }}
      className={cn(
        "group relative mb-4 block w-full break-inside-avoid cursor-pointer rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-accent",
        NOTE_SURFACE[note.color],
      )}
    >
      <div
        onClick={stop}
        className={cn(
          "absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-xl border border-glass bg-sidebar/95 p-1 shadow-md backdrop-blur transition",
          palette
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {palette ? (
          <>
            <div className="px-1.5">
              <ColorDots
                size="sm"
                value={note.color}
                onChange={(color) => {
                  if (color) void actions.patch(note, { color });
                  setPalette(false);
                }}
              />
            </div>
            <ActionButton label="Close colours" onClick={() => setPalette(false)}>
              <X className="size-3.5" />
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton
              label={note.pinned ? "Unpin" : "Pin to top"}
              active={note.pinned}
              onClick={() => void actions.patch(note, { pinned: !note.pinned })}
            >
              <Pin className="size-3.5" />
            </ActionButton>
            <ActionButton
              label={note.floating ? "Remove from screen" : "Keep on screen as a sticky"}
              active={note.floating}
              onClick={() => void actions.patch(note, { floating: !note.floating })}
            >
              <Monitor className="size-3.5" />
            </ActionButton>
            <ActionButton label="Change colour" onClick={() => setPalette(true)}>
              <Palette className="size-3.5" />
            </ActionButton>
            <ActionButton label="Duplicate" onClick={() => void actions.duplicate(note)}>
              <Copy className="size-3.5" />
            </ActionButton>
            <ActionButton label="Delete" danger onClick={() => onDelete(note)}>
              <Trash2 className="size-3.5" />
            </ActionButton>
          </>
        )}
      </div>

      {hasTitle ? (
        <h3 className="line-clamp-2 text-base font-semibold text-primary">{noteTitle(note)}</h3>
      ) : null}

      {note.body.trim() ? (
        <p
          className={cn(
            "line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed",
            hasTitle ? "mt-2 text-primary/75" : "text-[15px] text-primary/90",
          )}
        >
          {note.body}
        </p>
      ) : null}

      {note.checklist.length > 0 ? (
        <ul className={cn("space-y-1.5", hasTitle || note.body.trim() ? "mt-3" : "")}>
          {note.checklist.slice(0, VISIBLE_ITEMS).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  void actions.patch(note, {
                    checklist: note.checklist.map((entry) =>
                      entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                    ),
                  });
                }}
                className="flex w-full items-start gap-2 text-left text-sm text-primary/85"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-primary/30",
                    item.done && "border-accent bg-accent text-white",
                  )}
                >
                  {item.done ? <Check className="size-3" /> : null}
                </span>
                <span className={cn("min-w-0 break-words", item.done && "text-primary/45 line-through")}>
                  {item.text}
                </span>
              </button>
            </li>
          ))}
          {hiddenItems > 0 ? (
            <li className="pl-6 text-xs text-primary/50">+{hiddenItems} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center gap-2 text-[11px] text-primary/55">
        {note.pinned ? <Pin className="size-3 shrink-0 fill-accent text-accent" /> : null}
        <span className="inline-flex min-w-0 items-center gap-1">
          <FolderKanban className="size-3 shrink-0" />
          <span className="truncate">{note.project?.name ?? "Personal"}</span>
        </span>
        {note.floating ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
            <Monitor className="size-3" />
            On screen
          </span>
        ) : null}
        <span className="ml-auto shrink-0">
          {checklistProgress(note.checklist)}
          {note.checklist.length > 0 ? " · " : ""}
          {editedLabel(note.updatedAt)}
        </span>
      </div>
    </article>
  );
}

function ActionButton({
  label,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 text-primary/60 transition hover:bg-glass-button hover:text-primary",
        active && "text-accent",
        danger && "hover:text-red-400",
      )}
    >
      {children}
    </button>
  );
}
