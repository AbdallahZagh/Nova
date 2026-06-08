"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { DatePicker, formatDueDate } from "@/components/ui/Calendar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { UserProfileLink } from "@/components/users/UserProfileLink";
import { useAppData } from "@/components/providers/AppDataProvider";
import { ApiError } from "@/lib/api/client";
import {
  isPersistedSubtaskId,
  syncSubtaskAssigneesApi,
} from "@/lib/api/subtasks";
import {
  closeTaskCommentApi,
  createTaskCommentApi,
  listTaskCommentsApi,
  replyTaskCommentApi,
  type TaskComment,
} from "@/lib/api/task-comments";
import { cn } from "@/lib/cn";
import type { ProjectMemberRole } from "@/lib/projects";
import type { SelectOption } from "@/components/ui/fieldVariants";
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

function dedupeSubtasks(subtasks: Subtask[]): Subtask[] {
  const seen = new Set<string>();
  return subtasks.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

type TaskDrawerDetailsProps = {
  projectId: string;
  task: Task;
  onSave: (task: Task) => void | Promise<void>;
  onDelete: () => void;
  saving?: boolean;
  readOnly?: boolean;
  projectRole?: ProjectMemberRole | null;
  canAssignTasks?: boolean;
  assigneeOptions?: SelectOption[];
  canAssignSubtasks?: boolean;
  subtaskAssigneeOptions?: SelectOption[];
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
  readOnly,
  canAssignSubtasks,
  assigneeOptions,
  assignmentBusy,
  assignmentChanged,
  onToggle,
  onLabelChange,
  onLabelCommit,
  onDelete,
  onAssigneesChange,
  onAssigneesSave,
}: {
  subtask: Subtask;
  committedLabel: string;
  busy?: boolean;
  readOnly?: boolean;
  canAssignSubtasks?: boolean;
  assigneeOptions: SelectOption[];
  assignmentBusy?: boolean;
  assignmentChanged?: boolean;
  onToggle: () => void;
  onLabelChange: (label: string) => void;
  onLabelCommit: () => void;
  onDelete: () => void;
  onAssigneesChange: (assigneeIds: string[]) => void;
  onAssigneesSave: () => void;
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
    <li className="group flex flex-wrap items-center gap-2 rounded-xl border border-glass bg-glass-button/40 px-3 py-2 transition hover:border-glass/80">
      <button
        type="button"
        aria-label={subtask.done ? "Mark incomplete" : "Mark complete"}
        onClick={onToggle}
        disabled={busy || readOnly}
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
          disabled={busy || readOnly}
          className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none disabled:opacity-50"
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={() => {
            if (busy || readOnly) return;
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !readOnly) setEditing(true);
          }}
          className={cn(
            "min-w-0 flex-1 select-none text-sm",
            readOnly ? "cursor-default" : "cursor-text",
            subtask.done ? "text-primary/40 line-through" : "text-primary/85",
          )}
        >
          {subtask.label || (
            <span className="italic text-primary/30">Untitled</span>
          )}
        </span>
      )}

      {showConfirm && !readOnly && (
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

      {!readOnly && (
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
      )}
      {canAssignSubtasks && !readOnly ? (
        <div className="basis-full pt-1">
          <MultiSelect
            value={subtask.assigneeIds ?? []}
            onChange={onAssigneesChange}
            options={assigneeOptions}
            placeholder="Assign subtask..."
            variant="glass"
            aria-label="Subtask assignees"
            disabled={assignmentBusy || assigneeOptions.length === 0}
          />
          <button
            type="button"
            onClick={onAssigneesSave}
            disabled={!assignmentChanged || assignmentBusy}
            className="mt-2 w-full rounded-xl border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assignmentBusy ? "Saving..." : "Save Subtask Assignment"}
          </button>
        </div>
      ) : (subtask.assignees?.length ?? 0) > 0 ? (
        <div className="flex basis-full flex-wrap gap-1.5 pt-1">
          {subtask.assignees?.map((assignee, index) => (
            <span
              key={assignee.id ?? `${assignee.initials}-${assignee.name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-glass bg-glass-card px-2 py-1 text-[11px] font-medium text-primary/65"
            >
              <span className="flex size-4 items-center justify-center overflow-hidden rounded-full bg-glass-button text-[8px] font-semibold text-primary">
                {assignee.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assignee.avatarUrl}
                    alt={assignee.name}
                    className="size-full object-cover"
                  />
                ) : (
                  assignee.initials
                )}
              </span>
              <UserProfileLink
                userId={assignee.id}
                className="text-primary/65"
                title={`View ${assignee.name}`}
              >
                {assignee.name}
              </UserProfileLink>
            </span>
          ))}
        </div>
      ) : null}
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
  readOnly = false,
  projectRole = null,
  canAssignTasks = false,
  assigneeOptions = [],
  canAssignSubtasks = false,
  subtaskAssigneeOptions = [],
}: TaskDrawerDetailsProps) {
  const { toast } = useToast();
  const { createSubtask, updateSubtask, deleteSubtask } = useAppData();
  const [draft, setDraft] = useState<Task>(() => ({
    ...task,
    assigneeIds:
      task.assigneeIds ??
      (task.assignees.map((assignee) => assignee.id).filter(Boolean) as string[]),
  }));
  const [newSubtaskLabel, setNewSubtaskLabel] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [busySubtaskAssignmentId, setBusySubtaskAssignmentId] = useState<string | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [labelSnapshots, setLabelSnapshots] = useState<Record<string, string>>(
    () => Object.fromEntries(task.subtasks.map((s) => [s.id, s.label])),
  );
  const [subtaskAssigneeSnapshots, setSubtaskAssigneeSnapshots] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      task.subtasks.map((s) => [s.id, s.assigneeIds ?? []]),
    ),
  );

  useEffect(() => {
    /* sync drawer when parent task updates after API */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset from props
    setDraft({
      ...task,
      assigneeIds:
        task.assigneeIds ??
        (task.assignees.map((assignee) => assignee.id).filter(Boolean) as string[]),
      subtasks: dedupeSubtasks(task.subtasks),
    });
    setNewSubtaskLabel("");
    setLabelSnapshots(
      Object.fromEntries(task.subtasks.map((s) => [s.id, s.label])),
    );
    setSubtaskAssigneeSnapshots(
      Object.fromEntries(
        task.subtasks.map((s) => [s.id, s.assigneeIds ?? []]),
      ),
    );
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    listTaskCommentsApi(task.id)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            variant: "error",
            title: "Failed to load comments",
            message:
              err instanceof ApiError ? err.message : "Please try again.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, toast]);

  const displaySubtasks = useMemo(
    () => dedupeSubtasks(draft.subtasks),
    [draft.subtasks],
  );

  const completedCount = displaySubtasks.filter((s) => s.done).length;
  const totalCount = displaySubtasks.length;
  const progressPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const hasChanges = useMemo(() => {
    if (newSubtaskLabel.trim()) return true;
    if (taskSnapshot(task) !== taskSnapshot(draft)) return true;
    return hasUncommittedSubtaskLabels(draft.subtasks, labelSnapshots);
  }, [task, draft, newSubtaskLabel, labelSnapshots]);

  const hasAssigneeChanges = useMemo(() => {
    const current = [
      ...(task.assigneeIds ??
        (task.assignees
          .map((assignee) => assignee.id)
          .filter(Boolean) as string[])),
    ].sort();
    const next = [...(draft.assigneeIds ?? [])].sort();
    return JSON.stringify(current) !== JSON.stringify(next);
  }, [task.assigneeIds, task.assignees, draft.assigneeIds]);

  const updateSubtasksLocal = (subtasks: Subtask[]) =>
    setDraft((prev) => ({ ...prev, subtasks }));

  const subtaskError = (title: string, err: unknown) => {
    toast({
      variant: "error",
      title,
      message: err instanceof ApiError ? err.message : "Please try again.",
    });
  };

  const canAddComment =
    projectRole === "OWNER" || projectRole === "ADMIN" || projectRole === "MEMBER";
  const canModerateComments = projectRole === "OWNER" || projectRole === "ADMIN";

  const mergeComment = (saved: TaskComment) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === saved.id
          ? {
              ...comment,
              ...saved,
              createdBy: saved.createdBy ?? comment.createdBy,
              taskId: saved.taskId ?? comment.taskId,
            }
          : comment,
      ),
    );
  };

  const addComment = async () => {
    const content = commentContent.trim();
    if (!content || !canAddComment || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      const created = await createTaskCommentApi(task.id, content);
      setComments((prev) => [created, ...prev]);
      setCommentContent("");
      toast({
        variant: "success",
        title: "Comment added",
        message: "Your task comment was posted.",
      });
    } catch (err) {
      subtaskError("Could not add comment", err);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const submitReply = async (commentId: string) => {
    const content = replyContent.trim();
    if (!content || !canModerateComments || busyCommentId) return;

    setBusyCommentId(commentId);
    try {
      const saved = await replyTaskCommentApi(commentId, content);
      mergeComment(saved);
      setReplyingId(null);
      setReplyContent("");
      toast({
        variant: "success",
        title: "Reply added",
        message: "The comment was answered.",
      });
    } catch (err) {
      subtaskError("Could not reply to comment", err);
    } finally {
      setBusyCommentId(null);
    }
  };

  const closeComment = async (commentId: string) => {
    if (!canModerateComments || busyCommentId) return;

    setBusyCommentId(commentId);
    try {
      const saved = await closeTaskCommentApi(commentId);
      mergeComment(saved);
      toast({
        variant: "success",
        title: "Comment closed",
        message: "The comment is now read-only.",
      });
    } catch (err) {
      subtaskError("Could not close comment", err);
    } finally {
      setBusyCommentId(null);
    }
  };

  const toggleSubtask = async (id: string) => {
    if (readOnly) return;
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

  const updateSubtaskAssigneesLocal = (id: string, assigneeIds: string[]) =>
    updateSubtasksLocal(
      draft.subtasks.map((s) =>
        s.id === id
          ? {
              ...s,
              assigneeIds,
              assignees: assigneeIds.map((assigneeId) => {
                const existing = s.assignees?.find((a) => a.id === assigneeId);
                const option = subtaskAssigneeOptions.find(
                  (item) => item.value === assigneeId,
                );
                const label = option?.label ?? existing?.name ?? "Unknown";
                return {
                  id: assigneeId,
                  initials:
                    existing?.initials ??
                    label
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase(),
                  name: label,
                  avatarUrl: existing?.avatarUrl,
                };
              }),
            }
          : s,
      ),
    );

  const hasSubtaskAssigneeChanges = (subtask: Subtask) => {
    const current = [...(subtaskAssigneeSnapshots[subtask.id] ?? [])].sort();
    const next = [...(subtask.assigneeIds ?? [])].sort();
    return JSON.stringify(current) !== JSON.stringify(next);
  };

  const saveSubtaskAssignees = async (subtask: Subtask) => {
    if (
      readOnly ||
      !canAssignSubtasks ||
      !isPersistedSubtaskId(subtask.id) ||
      busySubtaskAssignmentId
    ) {
      return;
    }
    setBusySubtaskAssignmentId(subtask.id);
    try {
      const saved = await syncSubtaskAssigneesApi(
        subtask.id,
        subtaskAssigneeSnapshots[subtask.id] ?? [],
        subtask.assigneeIds ?? [],
      );
      if (saved) {
        updateSubtasksLocal(
          draft.subtasks.map((item) => (item.id === saved.id ? saved : item)),
        );
      }
      const savedAssigneeIds = saved?.assigneeIds ?? subtask.assigneeIds ?? [];
      setSubtaskAssigneeSnapshots((prev) => ({
        ...prev,
        [subtask.id]: savedAssigneeIds,
      }));
      toast({
        variant: "success",
        title: "Subtask assignment saved",
        message:
          savedAssigneeIds.length === 0
            ? "No users are assigned to this subtask."
            : `${savedAssigneeIds.length} user${savedAssigneeIds.length === 1 ? "" : "s"} assigned.`,
      });
    } catch (err) {
      subtaskError("Could not save subtask assignment", err);
    } finally {
      setBusySubtaskAssignmentId(null);
    }
  };

  const commitSubtaskLabel = async (id: string, label: string) => {
    if (readOnly) return;
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
    if (readOnly) return;
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

  const addSubtaskByLabel = async (label: string) => {
    if (readOnly) return null;
    const trimmed = label.trim();
    if (!trimmed || addingSubtask) return null;

    setAddingSubtask(true);
    try {
      const created = await createSubtask(projectId, task.id, trimmed);
      setLabelSnapshots((prev) => ({ ...prev, [created.id]: created.label }));
      /* draft syncs from task prop via useEffect after AppDataProvider updates */
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
    let subtasks = dedupeSubtasks(draft.subtasks);

    const pendingNew = newSubtaskLabel.trim();
    if (pendingNew) {
      const created = await addSubtaskByLabel(pendingNew);
      if (created) {
        subtasks = dedupeSubtasks([...subtasks, created]);
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
    if (readOnly || !hasChanges || saving) return;
    try {
      const toSave = await flushPendingSubtasks();
      await onSave(toSave);
    } catch {
      /* errors surfaced by subtask or parent handlers */
    }
  };

  const handleSaveAssignees = async () => {
    if (readOnly || !hasAssigneeChanges || saving) return;
    try {
      await onSave({
        ...draft,
        assigneeIds: draft.assigneeIds ?? [],
      });
    } catch {
      /* parent handler shows toast */
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
        disabled={readOnly}
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
            disabled={readOnly}
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
            disabled={readOnly}
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
            disabled={readOnly}
          />
        </div>
        <div className="col-span-2">
          <label
            htmlFor="task-drawer-assignees"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-primary/60"
          >
            Assigned to
          </label>
          {readOnly || !canAssignTasks ? (
            draft.assignees.length === 0 ? (
              <p className="rounded-xl border border-glass bg-glass-button/40 px-3 py-2 text-sm text-primary/45">
                No assignees
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-xl border border-glass bg-glass-button/40 px-3 py-2">
                {draft.assignees.map((assignee, index) => (
                  <span
                    key={assignee.id ?? `${assignee.initials}-${assignee.name}-${index}`}
                    className="inline-flex items-center gap-2 rounded-full border border-glass bg-glass-card px-2.5 py-1 text-xs font-medium text-primary/75"
                  >
                    <span className="flex size-5 items-center justify-center overflow-hidden rounded-full bg-glass-button text-[9px] font-semibold text-primary">
                      {assignee.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assignee.avatarUrl}
                          alt={assignee.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        assignee.initials
                      )}
                    </span>
                    <UserProfileLink
                      userId={assignee.id}
                      className="text-primary/75"
                      title={`View ${assignee.name}`}
                    >
                      {assignee.name}
                    </UserProfileLink>
                  </span>
                ))}
              </div>
            )
          ) : (
            <MultiSelect
              id="task-drawer-assignees"
              value={draft.assigneeIds ?? []}
              onChange={(assigneeIds) =>
                setDraft((prev) => ({ ...prev, assigneeIds }))
              }
              options={assigneeOptions}
              placeholder="Select assignees..."
              variant="glass"
              aria-label="Task assignees"
              disabled={assigneeOptions.length === 0}
            />
          )}
          {!readOnly && canAssignTasks && (
            <button
              type="button"
              onClick={() => void handleSaveAssignees()}
              disabled={saving || !hasAssigneeChanges}
              className="mt-2 w-full rounded-xl border border-accent/35 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Assignment"}
            </button>
          )}
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
          disabled={readOnly}
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

        {displaySubtasks.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {displaySubtasks.map((subtask) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                committedLabel={labelSnapshots[subtask.id] ?? ""}
                busy={busySubtaskId === subtask.id}
                readOnly={readOnly}
                canAssignSubtasks={canAssignSubtasks}
                assigneeOptions={subtaskAssigneeOptions}
                assignmentBusy={busySubtaskAssignmentId === subtask.id}
                assignmentChanged={hasSubtaskAssigneeChanges(subtask)}
                onToggle={() => void toggleSubtask(subtask.id)}
                onLabelChange={(label) =>
                  updateSubtaskLabelLocal(subtask.id, label)
                }
                onLabelCommit={() =>
                  void commitSubtaskLabel(subtask.id, subtask.label)
                }
                onDelete={() => void removeSubtask(subtask.id)}
                onAssigneesChange={(assigneeIds) =>
                  updateSubtaskAssigneesLocal(subtask.id, assigneeIds)
                }
                onAssigneesSave={() => void saveSubtaskAssignees(subtask)}
              />
            ))}
          </ul>
        )}

        {!readOnly && (
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
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
            Comments
          </h3>
          <span className="text-xs text-primary/40">{comments.length}</span>
        </div>

        {canAddComment && (
          <div className="mt-3 space-y-2">
            <Textarea
              variant="minimal"
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              rows={3}
              placeholder="Add a task comment..."
              className="resize-none focus:bg-glass-button/40"
              disabled={commentSubmitting}
            />
            <button
              type="button"
              onClick={() => void addComment()}
              disabled={!commentContent.trim() || commentSubmitting}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {commentSubmitting ? "Posting..." : "Add Comment"}
            </button>
          </div>
        )}

        {commentsLoading ? (
          <div className="mt-4 space-y-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl border border-glass bg-glass-button/40"
              />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p className="mt-4 text-sm text-primary/50">No comments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {comments.map((comment) => {
              const isClosed = comment.status === "CLOSED";
              const isBusy = busyCommentId === comment.id;
              const canAct = canModerateComments && !isClosed;
              const isReplying = replyingId === comment.id;

              return (
                <li
                  key={comment.id}
                  className="rounded-xl border border-glass bg-glass-button/40 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary">
                        <UserProfileLink
                          userId={comment.createdBy?.id}
                          className="text-primary"
                          title={`View ${comment.createdBy?.fullName ?? "Project member"}`}
                        >
                          {comment.createdBy?.fullName ?? "Project member"}
                        </UserProfileLink>
                      </p>
                      <p className="mt-0.5 text-xs text-primary/45">
                        {comment.createdLabel || "Recently"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        isClosed
                          ? "border-primary/20 text-primary/45"
                          : "border-accent/45 text-accent",
                      )}
                    >
                      {comment.status}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-primary/75">
                    {comment.content}
                  </p>

                  {comment.replyContent && (
                    <div className="mt-3 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-accent">
                          Reply
                        </p>
                        <p className="text-[11px] text-primary/45">
                          <UserProfileLink
                            userId={comment.repliedBy?.id}
                            className="text-primary/45"
                            title={`View ${comment.repliedBy?.fullName ?? "Admin"}`}
                          >
                            {comment.repliedBy?.fullName ?? "Admin"}
                          </UserProfileLink>
                          {comment.repliedLabel ? ` - ${comment.repliedLabel}` : ""}
                        </p>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-primary/75">
                        {comment.replyContent}
                      </p>
                    </div>
                  )}

                  {isClosed && comment.closedAt && (
                    <p className="mt-2 text-xs text-primary/40">
                      Closed by{" "}
                      <UserProfileLink
                        userId={comment.closedBy?.id}
                        className="text-primary/40"
                        title={`View ${comment.closedBy?.fullName ?? "Admin"}`}
                      >
                        {comment.closedBy?.fullName ?? "Admin"}
                      </UserProfileLink>
                      {comment.closedLabel ? ` - ${comment.closedLabel}` : ""}
                    </p>
                  )}

                  {isReplying && canAct ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        variant="minimal"
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        rows={3}
                        placeholder="Write a reply..."
                        className="resize-none focus:bg-glass-button/40"
                        disabled={isBusy}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId(null);
                            setReplyContent("");
                          }}
                          disabled={isBusy}
                          className="rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm font-medium text-primary transition hover:bg-glass-button/80 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitReply(comment.id)}
                          disabled={!replyContent.trim() || isBusy}
                          className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? "Replying..." : "Send Reply"}
                        </button>
                      </div>
                    </div>
                  ) : canAct ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingId(comment.id);
                          setReplyContent(comment.replyContent ?? "");
                        }}
                        disabled={isBusy}
                        className="rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm font-medium text-primary transition hover:text-accent disabled:opacity-50"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => void closeComment(comment.id)}
                        disabled={isBusy}
                        className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50 light:border-red-500/40 light:text-red-600"
                      >
                        {isBusy ? "Closing..." : "Close"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
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

      {!readOnly && (
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
      )}
    </div>
  );
}
