export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Completed";
export type TaskPriority = "High" | "Medium" | "Low";

export type TaskActivity = {
  id: string;
  message: string;
  time: string;
  /** ISO timestamp for sorting newest first */
  createdAtIso?: string;
  type?: string;
  authorName?: string;
};

export const TASK_STATUS_SORT_ORDER: Record<TaskStatus, number> = {
  "To Do": 0,
  "In Progress": 1,
  "In Review": 2,
  Completed: 3,
};

export const TASK_PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export function formatActivityTime(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function compareTasksByPriority(a: Task, b: Task): number {
  const byPriority =
    TASK_PRIORITY_SORT_ORDER[a.priority] - TASK_PRIORITY_SORT_ORDER[b.priority];
  if (byPriority !== 0) return byPriority;
  const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
  const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
  return bTime - aTime;
}

export function compareTasksByStatus(a: Task, b: Task): number {
  const byStatus =
    TASK_STATUS_SORT_ORDER[a.status] - TASK_STATUS_SORT_ORDER[b.status];
  if (byStatus !== 0) return byStatus;
  return compareTasksByPriority(a, b);
}

export function sortTasksByStatus(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasksByStatus);
}

/** Tasks in one kanban column: High → Medium → Low, then most recently updated. */
export function sortTasksInStatusColumn(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasksByPriority);
}

export function sortActivitiesNewestFirst(
  activities: TaskActivity[],
): TaskActivity[] {
  return [...activities].sort(
    (a, b) =>
      new Date(b.createdAtIso ?? 0).getTime() -
      new Date(a.createdAtIso ?? 0).getTime(),
  );
}

export type Task = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignees: {
    id?: string;
    initials: string;
    name: string;
    avatarUrl?: string | null;
    roleTitle?: string;
  }[];
  /** Display label for due date */
  dueDate: string;
  /** ISO string for API PATCH/POST */
  dueDateIso?: string | null;
  assigneeId?: string;
  assigneeIds?: string[];
  description: string;
  subtasks: {
    id: string;
    label: string;
    done: boolean;
    assignees?: {
      id?: string;
      initials: string;
      name: string;
      avatarUrl?: string | null;
      roleTitle?: string;
    }[];
    assigneeIds?: string[];
  }[];
  activity: TaskActivity[];
  projectId?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const TASK_COLUMNS: TaskStatus[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Completed",
];

export const TASK_STATUS_OPTIONS = TASK_COLUMNS.map((status) => ({
  value: status,
  label: status,
}));

export function formatDueDateFromIso(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isoToDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

export type CreateTaskInput = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeIds: string[];
  dueDate: string;
  dueDateIso?: string | null;
  subtasks: {
    id: string;
    label: string;
    done: boolean;
    assigneeIds?: string[];
  }[];
};
