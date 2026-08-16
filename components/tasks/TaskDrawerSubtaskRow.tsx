"use client";

import { useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { UserAvatar } from "@/components/users/UserAvatar";
import { UserProfileLink } from "@/components/users/UserProfileLink";
import { cn } from "@/lib/cn";
import type { SelectOption } from "@/components/ui/fieldVariants";
import type { Task } from "@/lib/tasks";

type Subtask = Task["subtasks"][number];

export function TaskDrawerSubtaskRow({
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
            searchable
            searchPlaceholder="Search people..."
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
              <UserAvatar
                name={assignee.name}
                avatarUrl={assignee.avatarUrl}
                initials={assignee.initials}
                size="xs"
              />
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
