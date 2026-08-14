"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PenLine, Plus } from "lucide-react";
import { WhiteboardsSkeleton } from "@/components/skeletons/WhiteboardsSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { WhiteboardCardMenu } from "@/components/whiteboard/WhiteboardCardMenu";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { ApiError } from "@/lib/api/client";
import {
  createWhiteboardApi,
  deleteWhiteboardApi,
  duplicateWhiteboardApi,
  listProjectWhiteboardsApi,
  listWhiteboardsApi,
} from "@/lib/api/whiteboards";
import type { Whiteboard } from "@/lib/whiteboard/types";

function WhiteboardListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { projects } = useAppData();
  const projectFilter = searchParams.get("projectId");

  const [boards, setBoards] = useState<Whiteboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projectFilter ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    setProjectId(projectFilter ?? "");
  }, [projectFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = projectFilter
      ? listProjectWhiteboardsApi(projectFilter)
      : listWhiteboardsApi();
    void load
      .then((rows) => {
        if (!cancelled) setBoards(rows);
      })
      .catch((err: unknown) => {
        toast({
          variant: "error",
          title: "Could not load whiteboards",
          message: err instanceof ApiError ? err.message : "Please try again.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectFilter, toast]);

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.title])),
    [projects],
  );

  const filteredProject = projectFilter
    ? projectNameById[projectFilter]
    : null;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const board = await createWhiteboardApi({
        title: title.trim() || undefined,
        projectId: projectId || undefined,
      });
      router.push(`/whiteboard/${board.id}`);
    } catch (err) {
      toast({
        variant: "error",
        title: "Create failed",
        message: err instanceof ApiError ? err.message : "Could not create the board.",
      });
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWhiteboardApi(deleteTarget.id);
      setBoards((current) => current.filter((board) => board.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        variant: "success",
        title: "Whiteboard deleted",
        message: `"${deleteTarget.title || "Untitled board"}" was removed.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Could not delete the board.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (board: Whiteboard) => {
    setDuplicatingId(board.id);
    try {
      const copy = await duplicateWhiteboardApi(board.id);
      router.push(`/whiteboard/${copy.id}`);
    } catch (err) {
      toast({
        variant: "error",
        title: "Duplicate failed",
        message: err instanceof ApiError ? err.message : "Could not copy the board.",
      });
      setDuplicatingId(null);
    }
  };

  if (loading) {
    return <WhiteboardsSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Whiteboards
          </h1>
          <p className="mt-1 text-sm text-primary/60">
            {filteredProject
              ? `Boards for ${filteredProject}. Draw together; strokes are saved for later OCR training.`
              : "Personal and project boards. Draw together; strokes are saved for later OCR training."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-4 py-2.5 text-sm font-semibold text-primary transition hover:opacity-90"
        >
          <Plus className="size-4" />
          New board
        </button>
      </div>

      {showCreate ? (
        <div className="rounded-2xl border border-glass bg-glass-card p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Board title"
              className="rounded-xl border border-glass bg-glass-button px-3 py-2.5 text-sm text-primary outline-none placeholder:text-primary/40 focus:border-accent/50"
            />
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="rounded-xl border border-glass bg-glass-button px-3 py-2.5 text-sm text-primary outline-none focus:border-accent/50"
            >
              <option value="">Personal board</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-glass px-4 py-2.5 text-sm text-primary/70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {boards.length === 0 ? (
        <div className="rounded-2xl border border-glass bg-glass-card p-10 text-center">
          <PenLine className="mx-auto size-8 text-accent/70" />
          <p className="mt-3 text-sm text-primary/60">No whiteboards yet.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            Create your first board
          </button>
        </div>
      ) : (
        <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <article
              key={board.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-glass bg-glass-card"
            >
              <Link href={`/whiteboard/${board.id}`} className="block">
                <div className="flex h-36 items-center justify-center bg-main">
                  {board.snapshot?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={board.snapshot.imageUrl}
                      src={board.snapshot.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <PenLine className="size-8 text-primary/25" />
                  )}
                </div>
              </Link>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    href={`/whiteboard/${board.id}`}
                    className="block truncate font-semibold text-primary hover:text-accent"
                  >
                    {board.title || "Untitled board"}
                  </Link>
                  <p className="mt-1 text-xs text-primary/50">
                    {board.projectId
                      ? projectNameById[board.projectId] ?? "Project board"
                      : "Personal"}
                    {board.pages?.length > 1 ? ` · ${board.pages.length} pages` : ""}
                    {board.lastEditedBy?.fullName
                      ? ` · ${board.lastEditedBy.fullName}`
                      : ""}
                    {" · "}
                    {new Date(board.lastEditedAt || board.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <WhiteboardCardMenu
                  board={board}
                  duplicating={duplicatingId === board.id}
                  onDuplicate={(item) => void handleDuplicate(item)}
                  onDelete={setDeleteTarget}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete whiteboard?"
        message="This permanently removes the board, strokes, and snapshot."
        itemName={deleteTarget?.title || "Untitled board"}
        confirmLabel={deleting ? "Deleting…" : "Delete board"}
      />
    </div>
  );
}

export default function WhiteboardListPageRoute() {
  return (
    <Suspense fallback={<WhiteboardsSkeleton />}>
      <WhiteboardListPage />
    </Suspense>
  );
}
