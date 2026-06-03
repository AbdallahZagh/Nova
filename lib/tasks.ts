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
    initials: string;
    name: string;
  }[];
  /** Display label for due date */
  dueDate: string;
  /** ISO string for API PATCH/POST */
  dueDateIso?: string | null;
  assigneeId?: string;
  description: string;
  subtasks: { id: string; label: string; done: boolean }[];
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

export const TEAM_MEMBERS = [
  { id: "am", initials: "AM", name: "Alex Morgan" },
  { id: "lk", initials: "LK", name: "Lina K." },
  { id: "dn", initials: "DN", name: "Devon N." },
  { id: "hm", initials: "HM", name: "Hana M." },
  { id: "qa", initials: "QA", name: "Quinn A." },
  { id: "op", initials: "OP", name: "Omar P." },
  { id: "se", initials: "SE", name: "Sara E." },
  { id: "nb", initials: "NB", name: "Nina B." },
] as const;

export type CreateTaskInput = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeIds: string[];
  dueDate: string;
  dueDateIso?: string | null;
  subtasks: { id: string; label: string; done: boolean }[];
};

export const initialProjectTasks: Task[] = [
  {
    id: "task-1",
    title: "Design onboarding flow screens",
    priority: "High",
    status: "To Do",
    assignees: [{ initials: "AM", name: "Alex Morgan" }],
    dueDate: "May 30",
    description:
      "Create high-fidelity onboarding screens with progressive disclosure and clear CTA hierarchy.",
    subtasks: [
      { id: "s1", label: "Wireframe welcome steps", done: true },
      { id: "s2", label: "Add empty-state illustrations", done: false },
      { id: "s3", label: "Review with product team", done: false },
    ],
    activity: [
      { id: "a1", message: "Task created by Alex Morgan", time: "2h ago" },
      { id: "a2", message: "Priority set to High", time: "1h ago" },
    ],
  },
  {
    id: "task-2",
    title: "Implement push notification service",
    priority: "Medium",
    status: "To Do",
    assignees: [{ initials: "LK", name: "Lina K." }],
    dueDate: "Jun 2",
    description:
      "Integrate FCM provider and map notification events to user preference settings.",
    subtasks: [
      { id: "s1", label: "Define event payload schema", done: false },
      { id: "s2", label: "Add retry queue", done: false },
    ],
    activity: [{ id: "a1", message: "Assigned to Lina K.", time: "Yesterday" }],
  },
  {
    id: "task-3",
    title: "Refactor billing webhook handlers",
    priority: "High",
    status: "In Progress",
    assignees: [{ initials: "DN", name: "Devon N." }],
    dueDate: "May 29",
    description:
      "Normalize webhook payloads and add idempotency keys for subscription updates.",
    subtasks: [
      { id: "s1", label: "Audit current handlers", done: true },
      { id: "s2", label: "Add signature validation", done: true },
      { id: "s3", label: "Write integration tests", done: false },
    ],
    activity: [
      { id: "a1", message: "Moved to In Progress", time: "4h ago" },
      { id: "a2", message: "Comment: retry logic added", time: "1h ago" },
    ],
  },
  {
    id: "task-4",
    title: "Update client portal navigation map",
    priority: "Low",
    status: "In Progress",
    assignees: [{ initials: "HM", name: "Hana M." }],
    dueDate: "Jun 4",
    description:
      "Align sidebar labels and route groups with the updated information architecture.",
    subtasks: [{ id: "s1", label: "Sync with design tokens", done: false }],
    activity: [{ id: "a1", message: "Status changed to In Progress", time: "Today" }],
  },
  {
    id: "task-5",
    title: "QA automation trigger rules",
    priority: "Medium",
    status: "In Progress",
    assignees: [{ initials: "QA", name: "Quinn A." }],
    dueDate: "Jun 1",
    description:
      "Define trigger conditions for nightly regression and release candidate pipelines.",
    subtasks: [
      { id: "s1", label: "Document trigger matrix", done: true },
      { id: "s2", label: "Connect CI workflow", done: false },
    ],
    activity: [{ id: "a1", message: "Subtask completed", time: "3h ago" }],
  },
  {
    id: "task-6",
    title: "Publish release checklist template",
    priority: "Low",
    status: "Completed",
    assignees: [{ initials: "OP", name: "Omar P." }],
    dueDate: "May 25",
    description:
      "Finalize release checklist with rollback steps and stakeholder sign-off fields.",
    subtasks: [
      { id: "s1", label: "Draft checklist sections", done: true },
      { id: "s2", label: "Share with engineering leads", done: true },
    ],
    activity: [
      { id: "a1", message: "Marked as Done", time: "Yesterday" },
      { id: "a2", message: "Approved by PM", time: "Yesterday" },
    ],
  },
  {
    id: "task-7",
    title: "Security dependency scan report",
    priority: "High",
    status: "Completed",
    assignees: [{ initials: "SE", name: "Sara E." }],
    dueDate: "May 24",
    description:
      "Compile dependency scan output and categorize remediation priorities by severity.",
    subtasks: [{ id: "s1", label: "Export scan artifacts", done: true }],
    activity: [{ id: "a1", message: "Task completed", time: "2 days ago" }],
  },
  {
    id: "task-8",
    title: "Knowledge base taxonomy cleanup",
    priority: "Medium",
    status: "To Do",
    assignees: [{ initials: "NB", name: "Nina B." }],
    dueDate: "Jun 6",
    description:
      "Reorganize article tags and merge duplicate categories for better discoverability.",
    subtasks: [
      { id: "s1", label: "List duplicate tags", done: false },
      { id: "s2", label: "Propose new taxonomy", done: false },
    ],
    activity: [{ id: "a1", message: "Task added to board", time: "Today" }],
  },
];

export const initialTasksByProject: Record<string, Task[]> = {
  "nova-mobile-app": initialProjectTasks,
};
