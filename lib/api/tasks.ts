import { apiFetch } from "@/lib/api/client";
import type {
  CreateTaskInput,
  Task,
  TaskActivity,
  TaskPriority,
  TaskStatus,
} from "@/lib/tasks";
import {
  formatActivityTime,
  sortActivitiesNewestFirst,
  sortTasksByStatus,
} from "@/lib/tasks";

export type ApiActivityActor = {
  id?: string;
  fullName?: string;
  initials?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ApiTaskActivity = {
  id?: string | null;
  type?: string;
  content?: string;
  message?: string;
  createdAt?: string;
  time?: string;
  createdBy?: ApiActivityActor | null;
};

export type ApiSubtask = {
  id: string;
  title?: string;
  label?: string;
  isCompleted?: boolean;
  done?: boolean;
  isDone?: boolean;
  taskId?: string;
};

export type ApiTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string;
  assigneeId?: string | null;
  assignee?: ApiActivityActor | null;
  assignees?: Array<ApiActivityActor>;
  subtasks?: ApiSubtask[];
  activity?: ApiTaskActivity[];
  activities?: ApiTaskActivity[];
  lastActivity?: ApiTaskActivity | null;
};

export type CreateTaskPayload = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  projectId: string;
  subtasks?: { title: string }[];
};

export type UpdateTaskPayload = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  completedAt?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function normalizeStatus(raw: string): TaskStatus {
  const s = raw.trim();
  if (s === "In Progress") return "In Progress";
  if (s === "In Review") return "In Review";
  if (s === "Completed" || s === "Done") return "Completed";
  return "To Do";
}

function normalizePriority(raw: string): TaskPriority {
  const p = raw.trim();
  if (p === "High" || p === "Critical") return "High";
  if (p === "Low") return "Low";
  return "Medium";
}

function formatDueDateDisplay(raw?: string | null): string {
  if (!raw) return "TBD";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDisplayableActivity(entry: ApiTaskActivity): boolean {
  if (!entry.id) return false;
  if (entry.type === "SYSTEM") return false;
  const text = (entry.content ?? entry.message ?? "").trim();
  if (!text || text === "No activity recorded yet") return false;
  return true;
}

function mapActivity(entry: ApiTaskActivity, index: number): TaskActivity {
  const createdAtIso = entry.createdAt ?? entry.time;
  return {
    id: entry.id ?? `activity-${index}`,
    message: entry.content ?? entry.message ?? "",
    time: formatActivityTime(createdAtIso),
    createdAtIso,
    type: entry.type,
    authorName: entry.createdBy?.fullName,
  };
}

function buildTaskActivities(api: ApiTask): TaskActivity[] {
  const raw = api.activities ?? api.activity ?? [];
  const entries: TaskActivity[] = raw
    .filter(isDisplayableActivity)
    .map(mapActivity);

  if (api.createdAt) {
    entries.push({
      id: `meta-created-${api.id}`,
      message: "Task created",
      time: formatActivityTime(api.createdAt),
      createdAtIso: api.createdAt,
      type: "CREATED",
    });
  }

  if (api.updatedAt && api.updatedAt !== api.createdAt) {
    entries.push({
      id: `meta-updated-${api.id}`,
      message: "Task updated",
      time: formatActivityTime(api.updatedAt),
      createdAtIso: api.updatedAt,
      type: "UPDATED",
    });
  }

  return sortActivitiesNewestFirst(entries);
}

export function apiTaskToTask(api: ApiTask): Task {
  const assigneeList = api.assignees ?? (api.assignee ? [api.assignee] : []);
  const assignees = assigneeList.map((a) => ({
    id: a.id,
    initials:
      a.initials ??
      (a.fullName
        ? a.fullName
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        : "??"),
    name: a.fullName ?? "Unknown",
    avatarUrl: a.avatarUrl,
    roleTitle: a.roleTitle,
  }));

  const assigneeId =
    api.assigneeId ?? api.assignee?.id ?? assigneeList[0]?.id ?? undefined;
  const assigneeIds = assigneeList.map((a) => a.id).filter(Boolean) as string[];

  return {
    id: api.id,
    title: api.title,
    description: api.description ?? "",
    status: normalizeStatus(api.status),
    priority: normalizePriority(api.priority),
    assignees,
    assigneeId: assigneeId ?? undefined,
    assigneeIds,
    dueDate: formatDueDateDisplay(api.dueDate),
    dueDateIso: api.dueDate ?? null,
    subtasks: (api.subtasks ?? []).map((s) => ({
      id: s.id,
      label: s.label ?? s.title ?? "",
      done: Boolean(s.isCompleted ?? s.done ?? s.isDone),
    })),
    activity: buildTaskActivities(api),
    projectId: api.projectId,
    completedAt: api.completedAt ?? null,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

export function createInputToPayload(
  projectId: string,
  input: CreateTaskInput,
): CreateTaskPayload {
  const payload: CreateTaskPayload = {
    title: input.title.trim(),
    projectId,
    description: input.description.trim() || undefined,
    status: input.status,
    priority: input.priority,
  };

  if (input.dueDateIso) {
    payload.dueDate = input.dueDateIso;
  }

  const subtaskTitles = input.subtasks
    .map((s) => s.label.trim())
    .filter(Boolean)
    .map((title) => ({ title }));

  if (subtaskTitles.length > 0) {
    payload.subtasks = subtaskTitles;
  }

  return payload;
}

export function taskToUpdatePayload(task: Task): UpdateTaskPayload {
  const payload: UpdateTaskPayload = {
    title: task.title.trim(),
    description: task.description,
    status: task.status,
    priority: task.priority,
  };

  if (task.dueDateIso) {
    payload.dueDate = task.dueDateIso;
  }

  if (task.status === "Completed") {
    payload.completedAt = new Date().toISOString();
  }

  if (task.dueDateIso === null) {
    payload.dueDate = null;
  }

  return payload;
}

export async function listTasksByProjectApi(projectId: string) {
  const data = await apiFetch<ApiTask[] | { tasks: ApiTask[] }>(
    `/api/tasks/project/${projectId}`,
  );
  const list = Array.isArray(data) ? data : (data.tasks ?? []);
  return sortTasksByStatus(list.map(apiTaskToTask));
}

export async function getTaskApi(taskId: string) {
  const data = await apiFetch<ApiTask>(`/api/tasks/${taskId}`);
  return apiTaskToTask(data);
}

export async function createTaskApi(projectId: string, input: CreateTaskInput) {
  const data = await apiFetch<ApiTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(createInputToPayload(projectId, input)),
  });
  const created = apiTaskToTask(data);
  await syncTaskAssignees(created.id, [], input.assigneeIds);
  return getTaskApi(created.id);
}

export async function updateTaskApi(task: Task) {
  const data = await apiFetch<ApiTask>(`/api/tasks/${task.id}`, {
    method: "PATCH",
    body: JSON.stringify(taskToUpdatePayload(task)),
  });
  const saved = apiTaskToTask(data);
  await syncTaskAssignees(
    task.id,
    task.assignees.map((assignee) => assignee.id).filter(Boolean) as string[],
    task.assigneeIds ?? [],
  );
  return getTaskApi(saved.id);
}

export async function deleteTaskApi(taskId: string) {
  await apiFetch<void>(`/api/tasks/${taskId}`, { method: "DELETE" });
}

export async function assignTasksApi(taskIds: string[], userIds: string[]) {
  const validTaskIds = taskIds.filter(isUuid);
  const validUserIds = userIds.filter(isUuid);
  if (validTaskIds.length === 0 || validUserIds.length === 0) return;

  await apiFetch<void>("/api/tasks/assign", {
    method: "POST",
    body: JSON.stringify(
      validUserIds.length === 1
        ? { userId: validUserIds[0], taskIds: validTaskIds }
        : {
            assignments: validUserIds.map((userId) => ({
              userId,
              taskIds: validTaskIds,
            })),
          },
    ),
  });
}

export async function unassignTaskApi(taskId: string, userId: string) {
  if (!isUuid(taskId) || !isUuid(userId)) return;
  await apiFetch<void>(`/api/tasks/${taskId}/assignees/${userId}`, {
    method: "DELETE",
  });
}

async function syncTaskAssignees(
  taskId: string,
  currentUserIds: string[],
  nextUserIds: string[],
) {
  const current = new Set(currentUserIds.filter(isUuid));
  const next = new Set(nextUserIds.filter(isUuid));
  const toAdd = [...next].filter((userId) => !current.has(userId));
  const toRemove = [...current].filter((userId) => !next.has(userId));

  await assignTasksApi([taskId], toAdd);
  await Promise.all(toRemove.map((userId) => unassignTaskApi(taskId, userId)));
}
