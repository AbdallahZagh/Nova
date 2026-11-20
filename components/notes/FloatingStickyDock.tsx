"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { AutoTextarea } from "@/components/notes/AutoTextarea";
import { ChecklistEditor } from "@/components/notes/ChecklistEditor";
import { ColorDots } from "@/components/notes/ColorDots";
import { NEW_STICKY_EVENT, useNotesChanges } from "@/components/notes/notes-sync";
import { useNoteDraft } from "@/components/notes/useNoteDraft";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { listNotesApi, updateNoteApi } from "@/lib/api/notes";
import { cn } from "@/lib/cn";
import {
  newChecklistItem,
  NOTE_STICKY_WIDTH,
  NOTE_SURFACE,
  noteTitle,
  sortNotes,
  type Note,
} from "@/lib/notes";

const MAX_STICKIES = 6;
const EDGE = 8;
const BASE_Z = 90;
const MIN_WIDTH = 220;
const MAX_WIDTH = 720;
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 900;

type ResizeAxis = "x" | "y" | "xy";
type ResizeStart = { axis: ResizeAxis; x: number; y: number; w: number; h: number };

type Entry = {
  key: string;
  noteId: string | null;
  note: Note | null;
  x: number;
  y: number;
};

const noopSubscribe = () => () => {};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function cascade(index: number) {
  const step = index % 6;
  const width = Math.min(NOTE_STICKY_WIDTH, window.innerWidth - EDGE * 2);
  return {
    x: Math.max(EDGE, window.innerWidth - width - 40 - step * 28),
    y: 92 + step * 34,
  };
}

/** Stickies that float above every page. Each one is a note you can drag, write in and keep. */
export function FloatingStickyDock() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const { toast } = useToast();
  const pathname = usePathname();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNotes, setMenuNotes] = useState<Note[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [zIndexes, setZIndexes] = useState<Record<string, number>>({});
  const zCounter = useRef(0);
  const draftCounter = useRef(0);
  const knownIds = useRef(new Set<string>());
  const entriesRef = useRef(entries);

  useEffect(() => {
    entriesRef.current = entries;
  });

  const toEntry = useCallback((note: Note, index: number): Entry => {
    const spot = cascade(index);
    return {
      key: note.id,
      noteId: note.id,
      note,
      x: note.posX ?? spot.x,
      y: note.posY ?? spot.y,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listNotesApi({ floating: true })
      .then((items) => {
        if (cancelled) return;
        items.forEach((item) => knownIds.current.add(item.id));
        setEntries((current) => {
          const loaded = items
            .filter((item) => !current.some((entry) => entry.noteId === item.id))
            .map((item, index) => toEntry(item, index));
          return [...loaded, ...current];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [toEntry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !event.ctrlKey || !event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      setMenuOpen((open) => {
        if (open) return false;
        setMenuLoading(true);
        listNotesApi()
          .then((items) => setMenuNotes(sortNotes(items)))
          .catch(() => setMenuNotes([]))
          .finally(() => setMenuLoading(false));
        return true;
      });
    };
    const onNewSticky = () => {
      setMenuOpen(true);
      setMenuLoading(true);
      listNotesApi()
        .then((items) => setMenuNotes(sortNotes(items)))
        .catch(() => setMenuNotes([]))
        .finally(() => setMenuLoading(false));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(NEW_STICKY_EVENT, onNewSticky);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(NEW_STICKY_EVENT, onNewSticky);
    };
  }, []);

  // Keep in step with the Notes page: pin a note on screen there and it shows up here.
  useNotesChanges((change) => {
    if (change.kind === "deleted") {
      knownIds.current.delete(change.id);
      setEntries((current) => current.filter((entry) => entry.noteId !== change.id));
      return;
    }
    const { note } = change;
    const onScreen = entriesRef.current.some((entry) => entry.noteId === note.id);
    if (!note.floating && !onScreen) {
      knownIds.current.delete(note.id);
      setEntries((current) => current.filter((entry) => entry.noteId !== note.id));
      return;
    }
    if (knownIds.current.has(note.id) || onScreen) {
      setEntries((current) =>
        current.map((entry) =>
          entry.noteId === note.id
            ? { ...entry, note: note.floating ? note : { ...note, floating: true } }
            : entry,
        ),
      );
      return;
    }
    knownIds.current.add(note.id);
    setEntries((current) => [...current, toEntry(note, current.length)]);
  });

  const bringToFront = useCallback((key: string) => {
    zCounter.current += 1;
    const next = zCounter.current;
    setZIndexes((current) => ({ ...current, [key]: next }));
  }, []);

  const createSticky = useCallback(() => {
    if (entriesRef.current.length >= MAX_STICKIES) {
      toast({
        variant: "error",
        title: `${MAX_STICKIES} stickies are already on screen`,
        message: "Put one away first. It stays in your Notes page.",
      });
      return;
    }
    draftCounter.current += 1;
    const key = `draft-${draftCounter.current}`;
    const spot = cascade(entriesRef.current.length);
    zCounter.current += 1;
    setZIndexes((current) => ({ ...current, [key]: zCounter.current }));
    setEntries((current) => [
      ...current,
      {
        key,
        noteId: null,
        note: null,
        x: Math.max(EDGE, Math.round(window.innerWidth / 2 - NOTE_STICKY_WIDTH / 2) + (spot.y - 92)),
        y: spot.y + 24,
      },
    ]);
    setMenuOpen(false);
  }, [toast]);

  const openStickyNote = useCallback(
    (note: Note) => {
      const existing = entriesRef.current.find((entry) => entry.noteId === note.id);
      if (existing) {
        bringToFront(existing.key);
        setMenuOpen(false);
        return;
      }
      if (entriesRef.current.length >= MAX_STICKIES) {
        toast({
          variant: "error",
          title: `${MAX_STICKIES} stickies are already on screen`,
          message: "Put one away first. It stays in your Notes page.",
        });
        return;
      }
      knownIds.current.add(note.id);
      zCounter.current += 1;
      setZIndexes((current) => ({ ...current, [note.id]: zCounter.current }));
      setEntries((current) => [...current, toEntry({ ...note, floating: true }, current.length)]);
      setMenuOpen(false);
      if (!note.floating) {
        void updateNoteApi(note.id, { floating: true }).catch(() => undefined);
      }
    },
    [bringToFront, toEntry, toast],
  );

  const markCreated = useCallback((key: string, noteId: string) => {
    knownIds.current.add(noteId);
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, noteId } : entry)),
    );
  }, []);

  const dismiss = useCallback((key: string) => {
    setEntries((current) => {
      const entry = current.find((item) => item.key === key);
      if (entry?.noteId) knownIds.current.delete(entry.noteId);
      return current.filter((item) => item.key !== key);
    });
  }, []);

  // A note that is open as a full page is not also shown as a sticky.
  const visible = entries.filter(
    (entry) => !(entry.noteId && pathname === `/notes/${entry.noteId}`),
  );

  if (!mounted) return null;
  if (!menuOpen && visible.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: BASE_Z }}>
      {menuOpen ? (
        <StickyMenu
          notes={menuNotes}
          loading={menuLoading}
          openIds={visible.map((entry) => entry.noteId).filter((id): id is string => Boolean(id))}
          onOpen={openStickyNote}
          onCreate={createSticky}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {visible.map((entry) => (
        <Sticky
          key={entry.key}
          entry={entry}
          z={BASE_Z + (zIndexes[entry.key] ?? 0)}
          onFocus={() => bringToFront(entry.key)}
          onCreated={(noteId) => markCreated(entry.key, noteId)}
          onDismiss={() => dismiss(entry.key)}
        />
      ))}
    </div>,
    document.body,
  );
}

function StickyMenu({
  notes,
  loading,
  openIds,
  onOpen,
  onCreate,
  onClose,
}: {
  notes: Note[];
  loading: boolean;
  openIds: string[];
  onOpen: (note: Note) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const open = new Set(openIds);
  return (
    <section
      className="pointer-events-auto absolute right-6 top-[4.5rem] flex max-h-[min(32rem,calc(100vh-6rem))] w-80 flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#3a2c12] text-[#e8e3e0] shadow-2xl shadow-black/40 light:border-amber-600/30 light:bg-[#fdeeb8] light:text-[#1c1208]"
      tabIndex={-1}
      aria-label="Sticky notes"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2.5">
        <StickyNote className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Stickies</p>
          <p className="text-[11px] opacity-60">Ctrl+Alt+S</p>
        </div>
        <button
          type="button"
          aria-label="Close stickies"
          onClick={onClose}
          className="rounded-lg p-1 opacity-60 transition hover:bg-black/10 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-6 text-center text-sm opacity-60">Loading your notes…</p>
        ) : notes.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm opacity-60">No notes yet. Create one below.</p>
        ) : (
          <ul className="space-y-1">
            {notes.map((note) => {
              const onScreen = open.has(note.id);
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(note)}
                    className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-black/10"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {noteTitle(note)}
                      </span>
                      <span className="block truncate text-[11px] opacity-60">
                        {note.project?.name ?? "Personal"}
                        {onScreen ? " · On screen" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-black/10 p-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e66a17] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="size-4" />
          New note
        </button>
      </div>
    </section>
  );
}

function Sticky({
  entry,
  z,
  onFocus,
  onCreated,
  onDismiss,
}: {
  entry: Entry;
  z: number;
  onFocus: () => void;
  onCreated: (noteId: string) => void;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const isDraft = entry.note === null;
  const { fields, noteId, status, errorMessage, set, flush, remove } = useNoteDraft({
    note: entry.note,
    defaults: { floating: true, color: "AMBER", posX: Math.round(entry.x), posY: Math.round(entry.y) },
    onCreated: (note) => onCreated(note.id),
  });

  const [pos, setPos] = useState({ x: entry.x, y: entry.y });
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number | null }>(() => ({
    w: entry.note?.width ?? NOTE_STICKY_WIDTH,
    h: entry.note?.height ?? null,
  }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resizing = useRef<ResizeStart | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const posRef = useRef(pos);
  const sizeRef = useRef(size);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = Math.min(size.w, viewport.w - EDGE * 2);
  const left = clamp(pos.x, EDGE, viewport.w - width - EDGE);
  const top = clamp(pos.y, EDGE, viewport.h - 56);
  const height = collapsed || size.h === null ? undefined : Math.min(size.h, viewport.h - top - EDGE);

  function startResize(event: React.PointerEvent<HTMLDivElement>, axis: ResizeAxis) {
    if (event.button !== 0) return;
    event.stopPropagation();
    resizing.current = {
      axis,
      x: event.clientX,
      y: event.clientY,
      w: width,
      h: height ?? sectionRef.current?.offsetHeight ?? MIN_HEIGHT,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only an optimisation.
    }
  }

  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    const start = resizing.current;
    if (!start) return;
    const next = {
      w:
        start.axis === "y"
          ? sizeRef.current.w
          : clamp(start.w + event.clientX - start.x, MIN_WIDTH, Math.min(MAX_WIDTH, viewport.w - left - EDGE)),
      h:
        start.axis === "x"
          ? sizeRef.current.h
          : clamp(start.h + event.clientY - start.y, MIN_HEIGHT, Math.min(MAX_HEIGHT, viewport.h - top - EDGE)),
    };
    sizeRef.current = next;
    setSize(next);
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizing.current) return;
    resizing.current = null;
    const { w, h } = sizeRef.current;
    set({ width: Math.round(w), ...(h === null ? {} : { height: Math.round(h) }) });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = { dx: event.clientX - left, dy: event.clientY - top };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only an optimisation; dragging still works without it.
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const next = {
      x: clamp(event.clientX - drag.current.dx, EDGE, viewport.w - width - EDGE),
      y: clamp(event.clientY - drag.current.dy, EDGE, viewport.h - 56),
    };
    posRef.current = next;
    setPos(next);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    set({ posX: Math.round(posRef.current.x), posY: Math.round(posRef.current.y) });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** Closes at once. The change is saved in the background (and when this unmounts). */
  function putAway() {
    if (noteId || fields.title.trim() || fields.body.trim() || fields.checklist.some((i) => i.text.trim())) {
      set({ floating: false });
      void flush();
    }
    onDismiss();
  }

  const label = fields.title.trim() || noteTitle({ title: null, preview: fields.body.trim() });

  return (
    <section
      ref={sectionRef}
      onPointerDown={onFocus}
      className={cn(
        "pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border shadow-2xl shadow-black/30",
        NOTE_SURFACE[fields.color],
      )}
      style={{ left, top, width, height, zIndex: z }}
      aria-label="Sticky note"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex cursor-grab touch-none select-none items-center gap-1 border-b border-primary/10 bg-black/5 px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="size-4 shrink-0 text-primary/40" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary/70">
          {collapsed && label !== "Untitled note" ? label : "Sticky note"}
        </span>
        <HeaderButton
          label={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </HeaderButton>
        {noteId ? (
          <HeaderButton
            label="Open in Notes"
            onClick={() => router.push(`/notes/${noteId}`)}
          >
            <ExternalLink className="size-3.5" />
          </HeaderButton>
        ) : null}
        <HeaderButton label="Put away (kept in Notes)" onClick={putAway}>
          <X className="size-3.5" />
        </HeaderButton>
      </div>

      {collapsed ? null : (
        <>
          <div
            className={cn(
              "flex min-h-0 flex-col gap-1.5 overflow-y-auto px-3 py-2.5",
              height === undefined ? "max-h-80" : "flex-1",
            )}
          >
            <input
              value={fields.title}
              onChange={(event) => set({ title: event.target.value })}
              placeholder="Title"
              className="w-full bg-transparent text-sm font-semibold text-primary outline-none placeholder:text-primary/35"
            />
            <AutoTextarea
              value={fields.body}
              autoFocus={isDraft}
              onChange={(event) => set({ body: event.target.value })}
              placeholder="Write something…"
              className="min-h-16 w-full resize-none bg-transparent text-sm leading-relaxed text-primary outline-none placeholder:text-primary/35"
            />
            {fields.checklist.length > 0 ? (
              <ChecklistEditor
                compact
                items={fields.checklist}
                onChange={(checklist) => set({ checklist })}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-primary/10 px-3 py-2">
            <ColorDots
              size="sm"
              value={fields.color}
              onChange={(color) => color && set({ color })}
            />
            {fields.checklist.length === 0 ? (
              <button
                type="button"
                aria-label="Add a checklist"
                title="Add a checklist"
                onClick={() => set({ checklist: [newChecklistItem()] })}
                className="rounded-md p-1 text-primary/55 transition hover:text-accent"
              >
                <CheckSquare className="size-3.5" />
              </button>
            ) : null}
            <span
              className={cn(
                "ml-auto min-w-0 truncate text-[11px]",
                status === "error" ? "text-red-400" : "text-primary/45",
              )}
              title={status === "error" ? errorMessage : undefined}
            >
              {status === "saving"
                ? "Saving…"
                : status === "error"
                  ? "Not saved"
                  : status === "saved"
                    ? "Saved"
                    : ""}
            </span>
            {noteId ? (
              <button
                type="button"
                aria-label="Delete note"
                title="Delete note"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md p-1 text-primary/45 transition hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        </>
      )}

      {collapsed ? null : (
        <>
          <div
            aria-hidden
            onPointerDown={(event) => startResize(event, "y")}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute bottom-0 left-3 right-5 h-1.5 cursor-ns-resize touch-none"
          />
          <div
            aria-hidden
            onPointerDown={(event) => startResize(event, "xy")}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="absolute bottom-0 right-0 flex size-5 cursor-nwse-resize touch-none items-end justify-end p-1"
          >
            <svg viewBox="0 0 10 10" className="size-2.5 text-primary/40" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M9 3 3 9M9 6.5 6.5 9" />
            </svg>
          </div>
        </>
      )}
      <div
        aria-hidden
        onPointerDown={(event) => startResize(event, "x")}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        className="absolute bottom-5 right-0 top-9 w-1.5 cursor-ew-resize touch-none"
      />

      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          if (await remove()) onDismiss();
        }}
        title="Delete note?"
        itemName={label || undefined}
      />
    </section>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md p-1 text-primary/55 transition hover:bg-black/10 hover:text-primary"
    >
      {children}
    </button>
  );
}
