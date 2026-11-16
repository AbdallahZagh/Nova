"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Search, StickyNote } from "lucide-react";
import { NoteCard } from "@/components/notes/NoteCard";
import { emitNotesChange, useNotesChanges } from "@/components/notes/notes-sync";
import { useNoteActions } from "@/components/notes/useNoteActions";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { createNoteApi, listNotesApi } from "@/lib/api/notes";
import { noteTitle, sortNotes, upsertNote, type Note } from "@/lib/notes";

/** Everything you have written about one project. Notes here stay private to you. */
export function ProjectNotesDrawer({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const actions = useNoteActions();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotesApi({ projectId })
      .then((items) => {
        if (!cancelled) setNotes(sortNotes(items));
      })
      .catch((error) => {
        if (!cancelled) {
          toast({
            variant: "error",
            title: "Could not load notes",
            message: error instanceof ApiError ? error.message : "Please try again.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, toast]);

  useNotesChanges((change) => {
    if (change.kind === "deleted") {
      setNotes((current) => current.filter((item) => item.id !== change.id));
      return;
    }
    setNotes((current) =>
      change.note.projectId === projectId
        ? upsertNote(current, change.note)
        : current.filter((item) => item.id !== change.note.id),
    );
  });

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return notes;
    return notes.filter((note) =>
      `${note.title ?? ""} ${note.body} ${note.checklist.map((item) => item.text).join(" ")}`
        .toLowerCase()
        .includes(text),
    );
  }, [notes, query]);

  async function quickAdd() {
    const body = draft.trim();
    if (!body || adding) return;
    setAdding(true);
    try {
      const created = await createNoteApi({ body, projectId, color: "AMBER" });
      emitNotesChange({ kind: "saved", note: created });
      setDraft("");
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not add note",
        message: error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setAdding(false);
    }
  }

  function openNew() {
    router.push(`/notes/new?projectId=${projectId}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-glass px-6 py-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void quickAdd();
          }}
        >
          <Input
            variant="soft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Jot something down about ${projectName}`}
            aria-label="Quick note"
          />
          <Button type="submit" variant="accent" disabled={!draft.trim() || adding}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <Plus className="size-4" />
            Write a full note
          </button>
          <Link
            href={`/notes?projectId=${projectId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary/55 transition hover:text-accent"
          >
            Open in Notes
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
        {notes.length > 4 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/40" />
            <Input
              variant="soft"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search these notes"
              aria-label="Search project notes"
              className="pl-9"
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="space-y-4">
            {[128, 176, 112].map((height, index) => (
              <Skeleton key={index} className="w-full rounded-2xl" style={{ height }} />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-glass px-6 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <StickyNote className="size-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-primary">No notes on this project yet</p>
            <p className="mt-1 text-sm text-primary/60">
              Use the box above for a quick thought, or write a full note with a checklist.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-primary/55">No notes match your search.</p>
        ) : (
          visible.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onOpen={(value) => router.push(`/notes/${value.id}`)}
              onDelete={setDeleteTarget}
            />
          ))
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
