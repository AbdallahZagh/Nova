"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Sparkles, X } from "lucide-react";
import { DatePicker, formatDueDate } from "@/components/ui/Calendar";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/components/providers/UserProvider";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  TASK_STATUS_OPTIONS,
  type CreateTaskInput,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";
import type { SelectOption } from "@/components/ui/fieldVariants";

type SubtaskItem = {
  id: string;
  label: string;
  done: boolean;
  assigneeIds?: string[];
};

function SubtaskRow({
  subtask,
  onToggle,
  onLabelChange,
  onDelete,
  onAssigneesChange,
  canAssignSubtasks,
  assigneeOptions,
}: {
  subtask: SubtaskItem;
  onToggle: () => void;
  onLabelChange: (label: string) => void;
  onDelete: () => void;
  onAssigneesChange: (assigneeIds: string[]) => void;
  canAssignSubtasks: boolean;
  assigneeOptions: SelectOption[];
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-xl border border-glass bg-glass-button/40 px-3 py-2 transition hover:border-glass/80">
      <button
        type="button"
        aria-label={subtask.done ? "Mark incomplete" : "Mark complete"}
        onClick={onToggle}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
          subtask.done
            ? "border-accent bg-accent text-white"
            : "border-glass bg-transparent text-transparent hover:border-accent/60",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={subtask.label}
          onChange={(e) => onLabelChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
          className="flex-1 bg-transparent text-sm text-primary outline-none"
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={() => {
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditing(true);
          }}
          className={cn(
            "flex-1 cursor-text select-none text-sm",
            subtask.done ? "text-primary/40 line-through" : "text-primary/85",
          )}
        >
          {subtask.label || <span className="italic text-primary/30">Untitled</span>}
        </span>
      )}

      <button
        type="button"
        aria-label="Remove subtask"
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-primary/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
      {canAssignSubtasks && (
        <div className="basis-full pt-1">
          <MultiSelect
            value={subtask.assigneeIds ?? []}
            onChange={onAssigneesChange}
            options={assigneeOptions}
            placeholder="Assign subtask..."
            variant="glass"
            aria-label="Subtask assignees"
            disabled={assigneeOptions.length === 0}
            searchable
            searchPlaceholder="Search people..."
          />
        </div>
      )}
    </li>
  );
}

type NewTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  defaultStatus?: TaskStatus;
  onCreate: (input: CreateTaskInput) => void | Promise<void>;
  canAssignTasks?: boolean;
  assigneeOptions?: SelectOption[];
  canAssignSubtasks?: boolean;
  subtaskAssigneeOptions?: SelectOption[];
  submitting?: boolean;
};

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

type AiTaskSuggestion = {
  description: string;
  subTasks: string[];
  priority: "LOW" | "MEDIUM" | "HIGH";
  suggestedDaysUntilDue: number;
};

const AI_PRIORITY_TO_TASK_PRIORITY: Record<AiTaskSuggestion["priority"], TaskPriority> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const aiFilledFieldClass =
  "border-accent/60 bg-accent/10 ring-1 ring-accent/25 shadow-[0_0_0_1px_rgba(197,96,16,0.08)]";

function AiDraftBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      AI draft
    </span>
  );
}

function dueDateFromSuggestedDays(days: number) {
  const due = new Date();
  due.setDate(due.getDate() + Math.max(0, days));
  return due;
}

function NewTaskForm({
  defaultStatus,
  onClose,
  onCreate,
  canAssignTasks,
  assigneeOptions,
  canAssignSubtasks,
  subtaskAssigneeOptions,
  submitting = false,
}: {
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => void | Promise<void>;
  canAssignTasks: boolean;
  assigneeOptions: SelectOption[];
  canAssignSubtasks: boolean;
  subtaskAssigneeOptions: SelectOption[];
  submitting?: boolean;
}) {
  const { toast } = useToast();
  const { profile } = useUser();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [newSubtaskLabel, setNewSubtaskLabel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratedFields, setAiGeneratedFields] = useState({
    description: false,
    priority: false,
    dueDate: false,
    subtasks: false,
  });

  const statusOptions = useMemo(
    () => TASK_STATUS_OPTIONS,
    [],
  );

  const updateSubtask = (id: string, changes: Partial<SubtaskItem>) =>
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));

  const updateSubtaskFromUser = (id: string, changes: Partial<SubtaskItem>) => {
    setAiGeneratedFields((prev) => ({ ...prev, subtasks: false }));
    updateSubtask(id, changes);
  };

  const deleteSubtask = (id: string) => {
    setAiGeneratedFields((prev) => ({ ...prev, subtasks: false }));
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  const addSubtask = () => {
    const label = newSubtaskLabel.trim();
    if (!label) return;
    setAiGeneratedFields((prev) => ({ ...prev, subtasks: false }));
    setSubtasks((prev) => [
      ...prev,
      { id: `s-${Date.now()}`, label, done: false, assigneeIds: [] },
    ]);
    setNewSubtaskLabel("");
  };

  const handleClose = () => {
    onClose();
  };

  const handleAiSuggest = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isGenerating) {
      if (!trimmedTitle) {
        toast({
          variant: "warning",
          title: "Add a title first",
          message: "The AI needs a task title before it can suggest details.",
        });
      }
      return;
    }

    setIsGenerating(true);
    try {
      const suggestion = await apiFetch<AiTaskSuggestion>("/api/tasks/ai-suggest", {
        method: "POST",
        body: JSON.stringify({ title: trimmedTitle }),
      });

      setDescription(suggestion.description ?? "");
      setPriority(AI_PRIORITY_TO_TASK_PRIORITY[suggestion.priority] ?? "Medium");
      setSubtasks(
        (suggestion.subTasks ?? [])
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label, index) => ({
            id: `ai-${Date.now()}-${index}`,
            label,
            done: false,
            assigneeIds: [],
          })),
      );
      setAiGeneratedFields({
        description: true,
        priority: true,
        dueDate: true,
        subtasks: true,
      });
      setDueDate(dueDateFromSuggestedDays(suggestion.suggestedDaysUntilDue ?? 0));
      toast({
        variant: "success",
        title: "Task details generated",
        message: "Review the AI suggestions before creating the task.",
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "AI suggestion failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not generate task details. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex max-h-[min(90vh,36rem)] w-full flex-col overflow-hidden rounded-2xl border border-glass bg-sidebar shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <div className="shrink-0 px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="new-task-title"
              className="text-lg font-semibold tracking-tight text-primary"
            >
              Create New Task
            </h2>
            <p className="mt-0.5 text-xs text-primary/75">
              Add a task to your project board.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-primary/75 transition hover:text-accent"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-3 h-0.5 w-full bg-linear-90 from-transparent via-accent to-transparent" />
      </div>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim() || submitting) return;
          const pendingSubtaskLabel = newSubtaskLabel.trim();
          const subtasksToSave = [
            ...subtasks,
            ...(pendingSubtaskLabel
              ? [
                  {
                    id: `s-${Date.now()}`,
                    label: pendingSubtaskLabel,
                    done: false,
                    assigneeIds: [],
                  },
                ]
              : []),
          ]
            .map((subtask) => ({
              ...subtask,
              label: subtask.label.trim(),
              assigneeIds: canAssignSubtasks ? (subtask.assigneeIds ?? []) : [],
            }))
            .filter((subtask) => subtask.label.length > 0);
          try {
            await onCreate({
              title: title.trim(),
              description: description.trim(),
              priority,
              status,
              assigneeIds: canAssignTasks ? assigneeIds : [],
              dueDate: dueDate ? formatDueDate(dueDate) : "TBD",
              dueDateIso: dueDate?.toISOString() ?? null,
              subtasks: subtasksToSave,
            });
            onClose();
          } catch {
            /* parent shows toast */
          }
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-1">
        <div>
          <label
            htmlFor="task-title"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Task Title
          </label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            type="text"
            required
            placeholder="e.g. Design onboarding flow"
          />
          {profile?.isDemo ? null : (
          <button
            type="button"
            onClick={handleAiSuggest}
            disabled={isGenerating || !title.trim()}
            aria-label="Generate task details with AI"
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-glass bg-glass-button/60 px-3 py-2 text-left transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/20">
                <Sparkles className={cn("size-4", isGenerating && "animate-pulse")} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-primary">
                  {isGenerating ? "Generating task draft" : "Generate with AI"}
                </span>
                <span className="block truncate text-[11px] text-primary/55">
                  Fill description, priority, due date, and subtasks.
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-accent/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              AI
            </span>
          </button>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="task-description"
              className="block text-xs font-semibold uppercase tracking-wider text-primary/75"
            >
              Description
            </label>
            <AiDraftBadge visible={aiGeneratedFields.description} />
          </div>
          <Textarea
            id="task-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setAiGeneratedFields((prev) => ({ ...prev, description: false }));
            }}
            rows={4}
            placeholder="Describe what needs to be done..."
            className={cn("resize-none transition", aiGeneratedFields.description && aiFilledFieldClass)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label
                htmlFor="task-priority"
                className="block text-xs font-semibold uppercase tracking-wider text-primary/75"
              >
                Priority
              </label>
              <AiDraftBadge visible={aiGeneratedFields.priority} />
            </div>
            <div className={cn("rounded-xl transition", aiGeneratedFields.priority && aiFilledFieldClass)}>
              <Select
                id="task-priority"
                value={priority}
                onChange={(value) => {
                  setPriority(value as TaskPriority);
                  setAiGeneratedFields((prev) => ({ ...prev, priority: false }));
                }}
                options={PRIORITY_OPTIONS}
                aria-label="Priority"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="task-status"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/75"
            >
              Column / Status
            </label>
            <Select
              id="task-status"
              value={status}
              onChange={(value) => setStatus(value as TaskStatus)}
              options={statusOptions}
              aria-label="Column status"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="task-due-date"
              className="block text-xs font-semibold uppercase tracking-wider text-primary/75"
            >
              Due Date
            </label>
            <AiDraftBadge visible={aiGeneratedFields.dueDate} />
          </div>
          <div className={cn("rounded-xl transition", aiGeneratedFields.dueDate && aiFilledFieldClass)}>
            <DatePicker
              id="task-due-date"
              value={dueDate}
              onChange={(date) => {
                setDueDate(date);
                setAiGeneratedFields((prev) => ({ ...prev, dueDate: false }));
              }}
              placeholder="Select due date..."
              aria-label="Due date"
            />
          </div>
        </div>

        {canAssignTasks && (
          <div>
            <label
              htmlFor="task-assign-to"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/75"
            >
              Assign To
            </label>
            <MultiSelect
              id="task-assign-to"
              value={assigneeIds}
              onChange={setAssigneeIds}
              options={assigneeOptions}
              placeholder="Select team members..."
              variant="glass"
              aria-label="Assign to"
              searchable
              searchPlaceholder="Search people..."
            />
          </div>
        )}

        {/* Subtasks */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-primary/75">
              Subtasks
            </label>
            <AiDraftBadge visible={aiGeneratedFields.subtasks} />
          </div>

          {subtasks.length > 0 && (
            <ul
              className={cn(
                "mb-2 space-y-1.5 rounded-xl transition",
                aiGeneratedFields.subtasks && "border border-accent/45 bg-accent/5 p-2 ring-1 ring-accent/15",
              )}
            >
              {subtasks.map((subtask) => (
                <SubtaskRow
                  key={subtask.id}
                  subtask={subtask}
                  onToggle={() => updateSubtaskFromUser(subtask.id, { done: !subtask.done })}
                  onLabelChange={(label) => updateSubtaskFromUser(subtask.id, { label })}
                  onDelete={() => deleteSubtask(subtask.id)}
                  onAssigneesChange={(assigneeIds) =>
                    updateSubtaskFromUser(subtask.id, { assigneeIds })
                  }
                  canAssignSubtasks={canAssignSubtasks}
                  assigneeOptions={subtaskAssigneeOptions}
                />
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newSubtaskLabel}
              onChange={(e) => {
                setNewSubtaskLabel(e.target.value);
                setAiGeneratedFields((prev) => ({ ...prev, subtasks: false }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtask();
                }
              }}
              placeholder="Add a subtask…"
              className="flex-1 rounded-xl border border-glass bg-glass-button/75 px-4 py-2.5 text-sm text-primary placeholder:text-primary/40 outline-none transition focus:border-accent/50 focus:bg-glass-button"
            />
            <button
              type="button"
              onClick={addSubtask}
              disabled={!newSubtaskLabel.trim()}
              aria-label="Add subtask"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-glass/60 bg-sidebar px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-xl px-4 py-2 text-sm font-medium text-primary transition hover:bg-glass-button disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewTaskModal({
  isOpen,
  onClose,
  defaultStatus = "To Do",
  onCreate,
  canAssignTasks = false,
  assigneeOptions = [],
  canAssignSubtasks = false,
  subtaskAssigneeOptions = [],
  submitting = false,
}: NewTaskModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-120 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <NewTaskForm
          key={defaultStatus}
          defaultStatus={defaultStatus}
          onClose={onClose}
          onCreate={onCreate}
          canAssignTasks={canAssignTasks}
          assigneeOptions={assigneeOptions}
          canAssignSubtasks={canAssignSubtasks}
          subtaskAssigneeOptions={subtaskAssigneeOptions}
          submitting={submitting}
        />
        </div>
      </div>
    </div>,
    document.body,
  );
}
