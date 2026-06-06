import { apiFetch } from "@/lib/api/client";
import {
  apiSubtaskToSubtask,
  syncSubtaskAssigneesApi,
  type ApiSubtask,
} from "@/lib/api/subtasks";
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
  name?: string;
  email?: string;
  initials?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ApiTaskAssignment = {
  assignedAt?: string;
  userId?: string;
  assigneeId?: string;
  user?: ApiActivityActor | null;
  assignee?: ApiActivityActor | null;
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

type ApiTaskListResponse =
  | ApiTask[]
  | {
      tasks?: ApiTask[];
      data?: ApiTask[];
      items?: ApiTask[];
      board?: { tasks?: ApiTask[] };
      project?: { tasks?: ApiTask[] };
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
  assignees?: Array<ApiActivityActor | ApiTaskAssignment>;
  assignedUsers?: Array<ApiActivityActor>;
  users?: Array<ApiActivityActor>;
  assignments?: ApiTaskAssignment[];
  taskAssignments?: ApiTaskAssignment[];
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

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function assignmentToActor(assignment: ApiTaskAssignment): ApiActivityActor {
  const actor = assignment.user ?? assignment.assignee ?? {};
  return {
    ...actor,
    id: actor.id ?? assignment.userId ?? assignment.assigneeId,
  };
}

function isTaskAssignment(value: ApiActivityActor | ApiTaskAssignment): value is ApiTaskAssignment {
  return "user" in value || "assignee" in value || "userId" in value || "assigneeId" in value;
}

function normalizeAssigneeEntry(
  entry: ApiActivityActor | ApiTaskAssignment,
): ApiActivityActor {
  return isTaskAssignment(entry) ? assignmentToActor(entry) : entry;
}

function getTaskAssigneeActors(api: ApiTask): ApiActivityActor[] {
  if (api.assignees?.length) return api.assignees.map(normalizeAssigneeEntry);
  if (api.assignedUsers?.length) return api.assignedUsers;
  if (api.users?.length) return api.users;
  if (api.taskAssignments?.length) {
    return api.taskAssignments.map(assignmentToActor);
  }
  if (api.assignments?.length) {
    return api.assignments.map(assignmentToActor);
  }
  return api.assignee ? [api.assignee] : [];
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

  if (api.lastActivity && isDisplayableActivity(api.lastActivity)) {
    const last = mapActivity(api.lastActivity, entries.length);
    if (!entries.some((entry) => entry.id === last.id)) {
      entries.push(last);
    }
  }

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
  const assigneeList = getTaskAssigneeActors(api);
  const assignees = assigneeList.map((a) => ({
    id: a.id,
    initials:
      a.initials ??
      (a.fullName || a.name || a.email
        ? initialsFromName(a.fullName ?? a.name ?? a.email ?? "")
        : "??"),
    name: a.fullName ?? a.name ?? a.email ?? "Unknown",
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
    subtasks: (api.subtasks ?? []).map(apiSubtaskToSubtask),
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
  const data = await apiFetch<ApiTaskListResponse>(
    `/api/tasks/project/${projectId}`,
  );
  const list = Array.isArray(data)
    ? data
    : (data.tasks ??
      data.data ??
      data.items ??
      data.board?.tasks ??
      data.project?.tasks ??
      []);
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
  const saved = await getTaskApi(created.id);
  await syncCreatedSubtaskAssignees(saved, input);
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

async function syncCreatedSubtaskAssignees(task: Task, input: CreateTaskInput) {
  const pairs = input.subtasks
    .map((subtask, index) => ({
      created: task.subtasks[index],
      assigneeIds: subtask.assigneeIds ?? [],
    }))
    .filter((item) => item.created && item.assigneeIds.length > 0);

  await Promise.all(
    pairs.map((item) =>
      syncSubtaskAssigneesApi(item.created.id, [], item.assigneeIds),
    ),
  );
}
