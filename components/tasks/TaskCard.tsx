"use client";

import { useState } from "react";
import { Calendar, GripVertical } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { type Task } from "@/lib/tasks";

export type { Task } from "@/lib/tasks";

const priorityStyles: Record<Task["priority"], string> = {
  High: "bg-red-500/10 text-red-500 light:bg-red-100 light:text-red-700",
  Medium: "bg-amber-500/10 text-amber-500 light:bg-amber-100 light:text-amber-700",
  Low: "bg-emerald-500/10 text-emerald-500 light:bg-emerald-100 light:text-emerald-700",
};

type TaskCardProps = {
  task: Task;
  onClick: () => void;
  canMove?: boolean;
};

export function TaskCard({ task, onClick, canMove = true }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable={canMove}
      onDragStart={(e) => {
        if (!canMove) return;
        e.dataTransfer.setData("taskId", task.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full text-left",
        canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-40",
      )}
    >
      <GlassCard
        className={cn(
          "border-glass p-4 transition duration-200",
          "hover:border-accent/50",
          isDragging && "shadow-none",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              priorityStyles[task.priority],
            )}
          >
            {task.priority}
          </span>

          {canMove ? (
            <GripVertical className="size-4 shrink-0 text-primary/25" />
          ) : null}
        </div>

        <h3 className="mt-3 text-sm font-medium leading-snug text-primary">
          {task.title}
        </h3>

        {task.subtasks.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-primary/50 mb-1">
              <span>Subtasks</span>
              <span>
                {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-glass-button">
              <div
                className="h-full rounded-full bg-accent/70 transition-all"
                style={{
                  width: `${Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center">
            {task.assignees.length === 0 ? (
              <div className="flex size-7 items-center justify-center rounded-full border border-glass bg-glass-button text-[10px] font-semibold text-primary/40">
                ?
              </div>
            ) : (
              <>
                {task.assignees.slice(0, 2).map((assignee, index) => (
                  <div
                    key={assignee.id ?? `${assignee.initials}-${assignee.name}-${index}`}
                    className={cn(
                      "flex size-7 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button text-[10px] font-semibold text-primary",
                      index > 0 && "-ml-2",
                    )}
                    title={assignee.name}
                  >
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
                  </div>
                ))}
                {task.assignees.length > 2 ? (
                  <span className="ml-1 text-[10px] font-medium text-primary/55">
                    +{task.assignees.length - 2}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-primary/55">
            <Calendar className="size-3.5" />
            <span>{task.dueDate}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
