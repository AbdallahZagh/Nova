"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { GlassCard } from "@/components/ui/GlassCard";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import {
  createProjectSuggestionApi,
  deleteProjectSuggestionApi,
  listProjectSuggestionsApi,
  PROJECT_SUGGESTION_STATUS_OPTIONS,
  updateProjectSuggestionApi,
  type ProjectSuggestion,
  type ProjectSuggestionStatus,
} from "@/lib/api/project-suggestions";
import { cn } from "@/lib/cn";

type ProjectSuggestionsDrawerProps = {
  projectId: string;
};

const statusStyles: Record<ProjectSuggestionStatus, string> = {
  "In Review": "border-accent/45 bg-accent/10 text-accent",
  "In Progress": "border-warning/45 bg-warning/10 text-warning",
  Done: "border-success/45 bg-success/10 text-success",
  Rejected: "border-red-500/45 bg-red-500/10 text-red-400 light:text-red-600",
};

function suggestionSnapshot(suggestion: ProjectSuggestion) {
  return JSON.stringify({
    content: suggestion.content.trim(),
    status: suggestion.status,
  });
}

export function ProjectSuggestionsDrawer({
  projectId,
}: ProjectSuggestionsDrawerProps) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ProjectSuggestion>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSuggestion | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listProjectSuggestionsApi(projectId)
      .then((list) => {
        if (!cancelled) setSuggestions(list);
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            variant: "error",
            title: "Failed to load suggestions",
            message:
              err instanceof ApiError ? err.message : "Please try again later.",
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

  const hasDraftChanges = useMemo(() => {
    if (!editingId) return false;
    const original = suggestions.find((s) => s.id === editingId);
    const draft = drafts[editingId];
    if (!original || !draft) return false;
    return suggestionSnapshot(original) !== suggestionSnapshot(draft);
  }, [drafts, editingId, suggestions]);

  const showError = (title: string, err: unknown) => {
    toast({
      variant: "error",
      title,
      message: err instanceof ApiError ? err.message : "Please try again.",
    });
  };

  const handleCreate = async () => {
    const trimmed = content.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      const created = await createProjectSuggestionApi(projectId, trimmed);
      setSuggestions((prev) => [created, ...prev]);
      setContent("");
      toast({
        variant: "success",
        title: "Suggestion added",
        message: "Your project suggestion is now in review.",
      });
    } catch (err) {
      showError("Could not add suggestion", err);
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (suggestion: ProjectSuggestion) => {
    setEditingId(suggestion.id);
    setDrafts((prev) => ({ ...prev, [suggestion.id]: suggestion }));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDrafts({});
  };

  const updateDraft = (
    id: string,
    patch: Partial<Pick<ProjectSuggestion, "content" | "status">>,
  ) => {
    setDrafts((prev) => {
      const current =
        prev[id] ?? suggestions.find((suggestion) => suggestion.id === id);
      if (!current) return prev;
      return { ...prev, [id]: { ...current, ...patch } };
    });
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft || !draft.content.trim() || savingId) return;

    setSavingId(id);
    try {
      const saved = await updateProjectSuggestionApi(id, {
        content: draft.content,
        status: draft.status,
      });
      setSuggestions((prev) =>
        prev.map((suggestion) => (suggestion.id === id ? saved : suggestion)),
      );
      cancelEditing();
      toast({
        variant: "success",
        title: "Suggestion updated",
        message: "The suggestion was saved.",
      });
    } catch (err) {
      showError("Could not update suggestion", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteProjectSuggestionApi(deleteTarget.id);
      setSuggestions((prev) =>
        prev.filter((suggestion) => suggestion.id !== deleteTarget.id),
      );
      if (editingId === deleteTarget.id) cancelEditing();
      setDeleteTarget(null);
      toast({
        variant: "success",
        title: "Suggestion deleted",
        message: "The suggestion was removed.",
      });
    } catch (err) {
      showError("Could not delete suggestion", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <GlassCard className="p-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-primary/60">
          New suggestion
        </label>
        <Textarea
          variant="minimal"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Add a project suggestion..."
          className="resize-none focus:bg-glass-button/40"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!content.trim() || creating}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-4" />
          )}
          Add Suggestion
        </button>
      </GlassCard>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
            Suggestions
          </h3>
          <span className="text-xs text-primary/40">{suggestions.length}</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl border border-glass bg-glass-card"
              />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-2xl border border-glass bg-glass-card p-6 text-center">
            <p className="text-sm text-primary/55">No suggestions yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((suggestion) => {
              const isEditing = editingId === suggestion.id;
              const draft = drafts[suggestion.id] ?? suggestion;
              const isSaving = savingId === suggestion.id;

              return (
                <li
                  key={suggestion.id}
                  className="rounded-2xl border border-glass bg-glass-card p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary">
                        {suggestion.author?.fullName ?? "Project member"}
                      </p>
                      <p className="mt-0.5 text-xs text-primary/45">
                        {suggestion.createdLabel || "Recently"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        statusStyles[suggestion.status],
                      )}
                    >
                      {suggestion.status}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        variant="minimal"
                        value={draft.content}
                        onChange={(e) =>
                          updateDraft(suggestion.id, { content: e.target.value })
                        }
                        rows={4}
                        className="resize-none focus:bg-glass-button/40"
                      />
                      <Select
                        value={draft.status}
                        onChange={(value) =>
                          updateDraft(suggestion.id, {
                            status: value as ProjectSuggestionStatus,
                          })
                        }
                        options={PROJECT_SUGGESTION_STATUS_OPTIONS}
                        variant="minimal"
                        aria-label="Suggestion status"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={isSaving}
                          className="flex items-center gap-2 rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm font-medium text-primary transition hover:bg-glass-button/80 disabled:opacity-50"
                        >
                          <X className="size-4" />
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSave(suggestion.id)}
                          disabled={
                            isSaving || !draft.content.trim() || !hasDraftChanges
                          }
                          className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/75">
                        {suggestion.content}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(suggestion)}
                          className="flex items-center gap-2 rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm font-medium text-primary transition hover:text-accent"
                        >
                          <Pencil className="size-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(suggestion)}
                          className="flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 light:border-red-500/40 light:text-red-600"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete suggestion?"
        message="This permanently removes the project suggestion."
        itemName={deleteTarget?.content}
        confirmLabel={deleting ? "Deleting..." : "Delete suggestion"}
      />
    </div>
  );
}
