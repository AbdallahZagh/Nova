"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Monitor, Pin, Plus, Search, StickyNote, X } from "lucide-react";
import { ColorDots } from "@/components/notes/ColorDots";
import { NoteCard } from "@/components/notes/NoteCard";
import { requestNewSticky, useNotesChanges } from "@/components/notes/notes-sync";
import { useNoteActions } from "@/components/notes/useNoteActions";
import { useAppData } from "@/components/providers/AppDataProvider";
import { NotesSkeleton } from "@/components/skeletons/NotesSkeleton";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { listNotesApi } from "@/lib/api/notes";
import { cn } from "@/lib/cn";
import {
  noteTitle,
  sortNotes,
  upsertNote,
  type Note,
  type NoteColor,
} from "@/lib/notes";

type Scope = "all" | "personal" | "project";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "personal", label: "Personal" },
  { value: "project", label: "In projects" },
];

const COLUMNS = "columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4";

function NotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const { toast } = useToast();
  const { projects } = useAppData();
  const actions = useNoteActions();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("all");
  const [projectFilter, setProjectFilter] = useState(searchParams.get("projectId") ?? "");
  const [color, setColor] = useState<NoteColor | null>(null);
  const [onScreenOnly, setOnScreenOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const filtersActive =
    scope !== "all" || Boolean(projectFilter) || Boolean(color) || onScreenOnly || Boolean(query.trim());

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const items = await listNotesApi({
          scope,
          projectId: projectFilter || undefined,
          color: color ?? undefined,
          floating: onScreenOnly || undefined,
          q: query,
        });
        if (!cancelled) setNotes(sortNotes(items));
      } catch (error) {
        if (!cancelled) {
          toast({
            variant: "error",
            title: "Could not load notes",
            message: error instanceof ApiError ? error.message : "Please try again.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope, projectFilter, color, onScreenOnly, query, toast]);

  // Old links like /notes?id=... now open the full-page note.
  useEffect(() => {
    if (idParam) router.replace(`/notes/${idParam}`);
  }, [idParam, router]);

  const matchesFilters = useCallback(
    (note: Note) => {
      if (scope === "personal" && note.projectId) return false;
      if (scope === "project" && !note.projectId) return false;
      if (projectFilter && note.projectId !== projectFilter) return false;
      if (color && note.color !== color) return false;
      if (onScreenOnly && !note.floating) return false;
      return true;
    },
    [scope, projectFilter, color, onScreenOnly],
  );

  useNotesChanges((change) => {
    if (change.kind === "deleted") {
      setNotes((current) => current.filter((item) => item.id !== change.id));
      return;
    }
    setNotes((current) =>
      matchesFilters(change.note)
        ? upsertNote(current, change.note)
        : current.filter((item) => item.id !== change.note.id),
    );
  });

  const pinned = useMemo(() => notes.filter((note) => note.pinned), [notes]);
  const rest = useMemo(() => notes.filter((note) => !note.pinned), [notes]);
  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, title: project.title })),
    [projects],
  );

  function openNew() {
    router.push(projectFilter ? `/notes/new?projectId=${projectFilter}` : "/notes/new");
  }

  function openSticky() {
    requestNewSticky();
  }

  const openNote = useCallback(
    (note: Note) => router.push(`/notes/${note.id}`),
    [router],
  );

  function clearFilters() {
    setScope("all");
    setProjectFilter("");
    setColor(null);
    setOnScreenOnly(false);
    setQuery("");
  }

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 p-6 md:-m-8 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Notes</h1>
          <p className="mt-1 text-sm text-primary/60">
            {loading
              ? "Loading your notes…"
              : `${notes.length} ${notes.length === 1 ? "note" : "notes"}${filtersActive ? " match" : ""} · private to you`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className="inline-flex items-center" onClick={openSticky}>
            <StickyNote className="mr-2 size-4" />
            New sticky
          </Button>
          <Button type="button" variant="accent" className="inline-flex items-center" onClick={openNew}>
            <Plus className="mr-2 size-4" />
            New note
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/40" />
          <Input
            variant="soft"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="pl-9 pr-9"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="inline-flex rounded-xl border border-glass bg-glass-card p-1">
          {SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setScope(item.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                scope === item.value
                  ? "bg-accent text-white"
                  : "text-primary/65 hover:text-primary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-52">
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            aria-label="Filter by project"
            options={[
              { value: "", label: "Any project" },
              ...projectOptions.map((project) => ({ value: project.id, label: project.title })),
            ]}
          />
        </div>

        <ColorDots value={color} onChange={setColor} size="sm" allowClear />

        <button
          type="button"
          aria-pressed={onScreenOnly}
          onClick={() => setOnScreenOnly((value) => !value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition",
            onScreenOnly
              ? "border-accent bg-accent/15 text-accent"
              : "border-glass text-primary/65 hover:text-primary",
          )}
        >
          <Monitor className="size-3.5" />
          On screen
        </button>

        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className={COLUMNS}>
            {[44, 56, 36, 64, 40, 52, 48, 36].map((height, index) => (
              <Skeleton
                key={index}
                className="mb-4 w-full break-inside-avoid rounded-2xl"
                style={{ height: height * 4 }}
              />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            filtered={filtersActive}
            onCreate={openNew}
            onSticky={openSticky}
            onClear={clearFilters}
          />
        ) : (
          <div className="space-y-8">
            {pinned.length > 0 ? (
              <section>
                <SectionTitle icon={<Pin className="size-3.5" />} label="Pinned" count={pinned.length} />
                <div className={COLUMNS}>
                  {pinned.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onOpen={openNote}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section>
                {pinned.length > 0 ? (
                  <SectionTitle label="Others" count={rest.length} />
                ) : null}
                <div className={COLUMNS}>
                  {rest.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onOpen={openNote}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void actions.remove(target);
        }}
        title="Delete note?"
        itemName={deleteTarget ? noteTitle(deleteTarget) : undefined}
      />
    </div>
  );
}

function SectionTitle({
  icon,
  label,
  count,
}: {
  icon?: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/50">
      {icon}
      {label}
      <span className="rounded-full bg-glass-button px-1.5 py-0.5 text-[10px] text-primary/60">
        {count}
      </span>
    </h2>
  );
}

function EmptyState({
  filtered,
  onCreate,
  onSticky,
  onClear,
}: {
  filtered: boolean;
  onCreate: () => void;
  onSticky: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full min-h-72 items-center justify-center rounded-2xl border border-dashed border-glass px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <StickyNote className="size-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-primary">
          {filtered ? "No notes match" : "Capture your first note"}
        </h2>
        <p className="mt-1 text-sm text-primary/60">
          {filtered
            ? "Try a different search or clear the filters."
            : "Write down ideas, checklists and reminders. Attach them to a project, or keep them to yourself. Drop a sticky anywhere on screen to stay in view while you work."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {filtered ? (
            <Button type="button" variant="secondary" onClick={onClear}>
              Clear filters
            </Button>
          ) : (
            <>
              <Button type="button" variant="accent" className="inline-flex items-center" onClick={onCreate}>
                <Plus className="mr-2 size-4" />
                New note
              </Button>
              <Button type="button" variant="secondary" className="inline-flex items-center" onClick={onSticky}>
                <StickyNote className="mr-2 size-4" />
                New sticky
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotesRoute() {
  return (
    <Suspense fallback={<NotesSkeleton />}>
      <NotesPage />
    </Suspense>
  );
}
