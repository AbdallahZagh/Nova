"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { DatePicker, formatDueDate } from "@/components/ui/Calendar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { ApiError } from "@/lib/api/client";
import { isPersistedSubtaskId } from "@/lib/api/subtasks";
import { cn } from "@/lib/cn";
import {
  formatActivityTime,
  sortActivitiesNewestFirst,
  TASK_STATUS_OPTIONS,
  type Task,
  type TaskActivity,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";

function parseDueDateIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

type Subtask = Task["subtasks"][number];

type TaskDrawerDetailsProps = {
  projectId: string;
  task: Task;
  onSave: (task: Task) => void | Promise<void>;
  onDelete: () => void;
  saving?: boolean;
};

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

function taskSnapshot(t: Task) {
  return JSON.stringify({
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDateIso: t.dueDateIso ?? null,
    subtasks: t.subtasks.map((s) => ({
      id: s.id,
      label: s.label.trim(),
      done: s.done,
    })),
  });
}

function hasUncommittedSubtaskLabels(
  subtasks: Subtask[],
  labelSnapshot: Record<string, string>,
): boolean {
  return subtasks.some((s) => {
    const saved = (labelSnapshot[s.id] ?? "").trim();
    const current = s.label.trim();
    return current !== saved && current.length > 0;
  });
}

// ─── Subtask row ────────────────────────────────────────────────────────────

function SubtaskRow({
  subtask,
  committedLabel,
  busy,
  onToggle,
  onLabelChange,
  onLabelCommit,
  onDelete,
}: {
  subtask: Subtask;
  committedLabel: string;
  busy?: boolean;
  onToggle: () => void;
  onLabelChange: (label: string) => void;
  onLabelCommit: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showConfirm =
    editing && subtask.label.trim() !== committedLabel.trim();

  const cancelEditing = () => {
    onLabelChange(committedLabel);
    setEditing(false);
  };

  const confirmEditing = () => {
    setEditing(false);
    onLabelCommit();
  };

  return (
    <li className="group flex items-center gap-2 rounded-xl border border-glass bg-glass-button/40 px-3 py-2 transition hover:border-glass/80">
      <button
        type="button"
        aria-label={subtask.done ? "Mark incomplete" : "Mark complete"}
        onClick={onToggle}
        disabled={busy}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50",
          subtask.done
            ? "border-accent bg-accent text-white"
            : "border-glass bg-transparent text-transparent hover:border-accent/60",
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={subtask.label}
          onChange={(e) => onLabelChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmEditing();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEditing();
            }
          }}
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none disabled:opacity-50"
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={() => {
            if (busy) return;
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) setEditing(true);
          }}
          className={cn(
            "min-w-0 flex-1 cursor-text select-none text-sm",
            subtask.done ? "text-primary/40 line-through" : "text-primary/85",
          )}
        >
          {subtask.label || (
            <span className="italic text-primary/30">Untitled</span>
          )}
        </span>
      )}

      {showConfirm && (
        <button
          type="button"
          aria-label="Save subtask name"
          onClick={confirmEditing}
          disabled={busy || !subtask.label.trim()}
          className="shrink-0 rounded p-0.5 text-accent transition hover:bg-accent/15 disabled:opacity-40"
        >
          <Check className="size-4" strokeWidth={2.5} />
        </button>
      )}

      <button
        type="button"
        aria-label="Remove subtask"
        onClick={onDelete}
        disabled={busy}
        className={cn(
          "shrink-0 rounded p-0.5 text-primary/30 transition hover:text-red-400 disabled:opacity-30",
          editing || showConfirm ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function TaskDrawerDetails({
  projectId,
  task,
  onSave,
  onDelete,
  saving = false,
}: TaskDrawerDetailsProps) {
  const { toast } = useToast();
  const { createSubtask, updateSubtask, deleteSubtask } = useAppData();
  const [draft, setDraft] = useState(task);
  const [newSubtaskLabel, setNewSubtaskLabel] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [labelSnapshots, setLabelSnapshots] = useState<Record<string, string>>(
    () => Object.fromEntries(task.subtasks.map((s) => [s.id, s.label])),
  );

  useEffect(() => {
    /* sync drawer when parent task updates after API */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset from props
    setDraft(task);
    setNewSubtaskLabel("");
    setLabelSnapshots(
      Object.fromEntries(task.subtasks.map((s) => [s.id, s.label])),
    );
  }, [task]);

  const completedCount = draft.subtasks.filter((s) => s.done).length;
  const totalCount = draft.subtasks.length;
  const progressPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const hasChanges = useMemo(() => {
    if (newSubtaskLabel.trim()) return true;
    if (taskSnapshot(task) !== taskSnapshot(draft)) return true;
    return hasUncommittedSubtaskLabels(draft.subtasks, labelSnapshots);
  }, [task, draft, newSubtaskLabel, labelSnapshots]);

  const updateSubtasksLocal = (subtasks: Subtask[]) =>
    setDraft((prev) => ({ ...prev, subtasks }));

  const subtaskError = (title: string, err: unknown) => {
    toast({
      variant: "error",
      title,
      message: err instanceof ApiError ? err.message : "Please try again.",
    });
  };

  const toggleSubtask = async (id: string) => {
    const sub = draft.subtasks.find((s) => s.id === id);
    if (!sub || busySubtaskId) return;

    const nextDone = !sub.done;
    updateSubtasksLocal(
      draft.subtasks.map((s) => (s.id === id ? { ...s, done: nextDone } : s)),
    );

    if (!isPersistedSubtaskId(id)) return;

    setBusySubtaskId(id);
    try {
      await updateSubtask(projectId, task.id, id, { done: nextDone });
    } catch (err) {
      setDraft((prev) => ({
        ...prev,
        subtasks: prev.subtasks.map((s) =>
          s.id === id ? { ...s, done: sub.done } : s,
        ),
      }));
      subtaskError("Could not update subtask", err);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const updateSubtaskLabelLocal = (id: string, label: string) =>
    updateSubtasksLocal(
      draft.subtasks.map((s) => (s.id === id ? { ...s, label } : s)),
    );

  const commitSubtaskLabel = async (id: string, label: string) => {
    const trimmed = label.trim();
    const previous = labelSnapshots[id] ?? "";
    if (!trimmed || trimmed === previous || !isPersistedSubtaskId(id)) {
      if (!trimmed) {
        updateSubtasksLocal(
          draft.subtasks.map((s) =>
            s.id === id ? { ...s, label: previous } : s,
          ),
        );
      }
      return;
    }

    setBusySubtaskId(id);
    try {
      await updateSubtask(projectId, task.id, id, { label: trimmed });
      setLabelSnapshots((prev) => ({ ...prev, [id]: trimmed }));
    } catch (err) {
      updateSubtasksLocal(
        draft.subtasks.map((s) =>
          s.id === id ? { ...s, label: previous } : s,
        ),
      );
      subtaskError("Could not rename subtask", err);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const removeSubtask = async (id: string) => {
    if (busySubtaskId) return;

    const previous = draft.subtasks;
    updateSubtasksLocal(previous.filter((s) => s.id !== id));

    if (!isPersistedSubtaskId(id)) return;

    setBusySubtaskId(id);
    try {
      await deleteSubtask(projectId, task.id, id);
      setLabelSnapshots((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      updateSubtasksLocal(previous);
      subtaskError("Could not delete subtask", err);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const addSubtaskByLabel = async (label: string, syncDraft = true) => {
    const trimmed = label.trim();
    if (!trimmed || addingSubtask) return null;

    setAddingSubtask(true);
    try {
      const created = await createSubtask(projectId, task.id, trimmed);
      setLabelSnapshots((prev) => ({ ...prev, [created.id]: created.label }));
      if (syncDraft) {
        setDraft((prev) => ({
          ...prev,
          subtasks: [...prev.subtasks, created],
        }));
      }
      return created;
    } catch (err) {
      subtaskError("Could not add subtask", err);
      throw err;
    } finally {
      setAddingSubtask(false);
    }
  };

  const addSubtask = async () => {
    const label = newSubtaskLabel.trim();
    if (!label) return;
    try {
      await addSubtaskByLabel(label);
      setNewSubtaskLabel("");
    } catch {
      /* toast shown */
    }
  };

  const flushPendingSubtasks = async (): Promise<Task> => {
    let subtasks = [...draft.subtasks];

    const pendingNew = newSubtaskLabel.trim();
    if (pendingNew) {
      const created = await addSubtaskByLabel(pendingNew, false);
      if (created) {
        subtasks = [...subtasks, created];
        setNewSubtaskLabel("");
      }
    }

    for (const sub of subtasks) {
      const saved = (labelSnapshots[sub.id] ?? "").trim();
      const current = sub.label.trim();
      if (current && current !== saved && isPersistedSubtaskId(sub.id)) {
        await commitSubtaskLabel(sub.id, current);
      }
    }

    const next: Task = {
      ...draft,
      subtasks,
      title: draft.title.trim(),
      dueDate: (() => {
        const d = parseDueDateIso(draft.dueDateIso);
        return d ? formatDueDate(d) : "TBD";
      })(),
    };
    setDraft(next);
    return next;
  };

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    try {
      const toSave = await flushPendingSubtasks();
      await onSave(toSave);
    } catch {
      /* errors surfaced by subtask or parent handlers */
    }
  };

  const selectedDueDate = useMemo(
    () => parseDueDateIso(draft.dueDateIso),
    [draft.dueDateIso],
  );

  const activityTimeline = useMemo((): TaskActivity[] => {
    const entries = [...draft.activity];
    const hasCreated = entries.some((e) => e.type === "CREATED");
    const hasUpdated = entries.some((e) => e.type === "UPDATED");

    if (draft.createdAt && !hasCreated) {
      entries.push({
        id: `meta-created-${draft.id}`,
        message: "Task created",
        time: "",
        createdAtIso: draft.createdAt,
        type: "CREATED",
      });
    }
    if (
      draft.updatedAt &&
      draft.updatedAt !== draft.createdAt &&
      !hasUpdated
    ) {
      entries.push({
        id: `meta-updated-${draft.id}`,
        message: "Task updated",
        time: "",
        createdAtIso: draft.updatedAt,
        type: "UPDATED",
      });
    }

    return sortActivitiesNewestFirst(entries).map((entry) =>
      entry.time
        ? entry
        : {
            ...entry,
            time: formatActivityTime(entry.createdAtIso),
          },
    );
  }, [draft.activity, draft.createdAt, draft.updatedAt, draft.id]);

  return (
    <div className="space-y-5">
      <Input
        variant="minimal"
        value={draft.title}
        onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
        className="text-xl font-semibold"
        aria-label="Task title"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-primary/60">
            Status
          </label>
          <Select
            value={draft.status}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, status: value as TaskStatus }))
            }
            options={TASK_STATUS_OPTIONS}
            variant="minimal"
            aria-label="Task status"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-primary/60">
            Priority
          </label>
          <Select
            value={draft.priority}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, priority: value as TaskPriority }))
            }
            options={PRIORITY_OPTIONS}
            variant="minimal"
            aria-label="Task priority"
          />
        </div>
        <div className="col-span-2">
          <label
            htmlFor="task-drawer-due-date"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-primary/60"
          >
            Due date
          </label>
          <DatePicker
            id="task-drawer-due-date"
            value={selectedDueDate}
            onChange={(date) =>
              setDraft((prev) => ({
                ...prev,
                dueDateIso: date?.toISOString() ?? null,
                dueDate: date ? formatDueDate(date) : "TBD",
              }))
            }
            placeholder="Select due date..."
            aria-label="Due date"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-primary/60">
          Description
        </label>
        <Textarea
          variant="minimal"
          value={draft.description}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, description: e.target.value }))
          }
          rows={4}
          className="resize-none focus:bg-glass-button/40"
          placeholder="Add a description..."
        />
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
            Subtasks
          </h3>
          {totalCount > 0 && (
            <span className="text-xs font-medium text-primary/50">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-glass-button">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {draft.subtasks.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {draft.subtasks.map((subtask) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                committedLabel={labelSnapshots[subtask.id] ?? ""}
                busy={busySubtaskId === subtask.id}
                onToggle={() => void toggleSubtask(subtask.id)}
                onLabelChange={(label) =>
                  updateSubtaskLabelLocal(subtask.id, label)
                }
                onLabelCommit={() =>
                  void commitSubtaskLabel(subtask.id, subtask.label)
                }
                onDelete={() => void removeSubtask(subtask.id)}
              />
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            value={newSubtaskLabel}
            onChange={(e) => setNewSubtaskLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSubtask();
              }
            }}
            placeholder="Add a subtask…"
            disabled={addingSubtask}
            className="flex-1 rounded-lg border border-glass bg-glass-button/40 px-3 py-2 text-sm text-primary placeholder:text-primary/35 outline-none transition focus:border-accent/50 focus:bg-glass-button disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void addSubtask()}
            disabled={!newSubtaskLabel.trim() || addingSubtask}
            aria-label="Add subtask"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {addingSubtask ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
          Activity
        </h3>
        {activityTimeline.length === 0 ? (
          <p className="mt-3 text-sm text-primary/50">No activity yet.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {activityTimeline.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-glass bg-glass-button/40 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug text-primary/85">
                    {entry.message}
                  </p>
                  {entry.type && (
                    <span className="shrink-0 rounded-md bg-glass-button px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary/45">
                      {entry.type === "STATUS_CHANGE"
                        ? "Status"
                        : entry.type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-primary/50">
                  {entry.authorName ? (
                    <>
                      <span className="font-medium text-primary/65">
                        {entry.authorName}
                      </span>
                      <span className="text-primary/35"> · </span>
                    </>
                  ) : null}
                  {entry.time}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-400 light:text-red-600 light:border-red-500/40 transition hover:bg-red-500/10"
        >
          <Trash2 className="size-4" />
          Delete
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges || addingSubtask}
          className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
