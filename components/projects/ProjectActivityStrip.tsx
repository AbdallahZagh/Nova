"use client";

import { formatActivityTime } from "@/lib/tasks";
import type { ProjectActivityItem } from "@/lib/api/projects";

function activityLine(item: ProjectActivityItem) {
  const action = item.content
    ? item.content.charAt(0).toLowerCase() + item.content.slice(1)
    : "updated a task";
  if (item.taskTitle) {
    return `${item.authorName} ${action} · ${item.taskTitle}`;
  }
  return `${item.authorName} ${action}`;
}

export function ProjectActivityStrip({
  items,
  onOpenTask,
}: {
  items: ProjectActivityItem[];
  onOpenTask?: (taskId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-primary/55">No activity yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const clickable = Boolean(item.taskId && onOpenTask);
        const className =
          "w-full rounded-2xl border border-glass bg-glass-card p-4 text-left transition hover:border-accent/40";
        const body = (
          <>
            <p className="text-sm font-medium leading-5 text-primary">
              {activityLine(item)}
            </p>
            <p className="mt-2 text-xs text-primary/45">
              {formatActivityTime(item.createdAt)}
            </p>
          </>
        );
        return (
          <li key={item.id}>
            {clickable ? (
              <button
                type="button"
                onClick={() => onOpenTask?.(item.taskId!)}
                className={className}
              >
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
