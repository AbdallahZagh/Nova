import { apiClient } from "@/api/apiClient";
import {
  apiSubtaskToSubtask,
  createSubtaskApi,
  deleteSubtaskApi,
  isPersistedSubtaskId,
  updateSubtaskApi,
  type ApiSubtask,
  type SubtaskItem,
} from "@/api/subtasks";

export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Completed";
export type TaskPriority = "High" | "Medium" | "Low";

export type TaskActivity = {
  id: string;
  message: string;
  time: string;
  createdAtIso?: string;
  type?: string;
  authorName?: string;
};

export type TaskAssignee = {
  id?: string;
  initials: string;
  name: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type Task = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignees: TaskAssignee[];
  dueDate: string;
  dueDateIso?: string | null;
  assigneeId?: string;
  assigneeIds?: string[];
  description: string;
  subtasks: SubtaskItem[];
  activity: TaskActivity[];
  projectId?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

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

type ApiActor = {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  initials?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

type ApiTaskAssignment = {
  assignedAt?: string;
  userId?: string;
  assigneeId?: string;
  user?: ApiActor | null;
  assignee?: ApiActor | null;
};

type ApiActivity = {
  id?: string | null;
  type?: string;
  content?: string;
  message?: string;
  createdAt?: string;
  time?: string;
  createdBy?: ApiActor | null;
};

type ApiTask = {
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
  assignee?: ApiActor | null;
  assignees?: (ApiActor | ApiTaskAssignment)[];
  assignedUsers?: ApiActor[];
  users?: ApiActor[];
  assignments?: ApiTaskAssignment[];
  taskAssignments?: ApiTaskAssignment[];
  subtasks?: ApiSubtask[];
  activity?: ApiActivity[];
  activities?: ApiActivity[];
  lastActivity?: ApiActivity | null;
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

export const TASK_COLUMNS: TaskStatus[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Completed",
];

export const TASK_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];

const statusSort: Record<TaskStatus, number> = {
  "To Do": 0,
  "In Progress": 1,
  "In Review": 2,
  Completed: 3,
};

const prioritySort: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeStatus(raw: string): TaskStatus {
  const status = raw.trim();
  if (status === "In Progress") return "In Progress";
  if (status === "In Review") return "In Review";
  if (status === "Completed" || status === "Done") return "Completed";
  return "To Do";
}

function normalizePriority(raw: string): TaskPriority {
  const priority = raw.trim();
  if (priority === "High" || priority === "Critical") return "High";
  if (priority === "Low") return "Low";
  return "Medium";
}

function formatDueDate(raw?: string | null) {
  if (!raw) return "TBD";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateInputToIso(value: string) {
  if (!value.trim()) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

export function isoToDateInputValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatActivityTime(raw?: string) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isAssignment(value: ApiActor | ApiTaskAssignment): value is ApiTaskAssignment {
  return "user" in value || "assignee" in value || "userId" in value || "assigneeId" in value;
}

function assignmentToActor(assignment: ApiTaskAssignment): ApiActor {
  const actor = assignment.user ?? assignment.assignee ?? {};
  return { ...actor, id: actor.id ?? assignment.userId ?? assignment.assigneeId };
}

function getAssigneeActors(api: ApiTask) {
  if (api.assignees?.length) return api.assignees.map((item) => isAssignment(item) ? assignmentToActor(item) : item);
  if (api.assignedUsers?.length) return api.assignedUsers;
  if (api.users?.length) return api.users;
  if (api.taskAssignments?.length) return api.taskAssignments.map(assignmentToActor);
  if (api.assignments?.length) return api.assignments.map(assignmentToActor);
  return api.assignee ? [api.assignee] : [];
}

function mapActivity(entry: ApiActivity, index: number): TaskActivity | null {
  if (!entry.id || entry.type === "SYSTEM") return null;
  const message = (entry.content ?? entry.message ?? "").trim();
  if (!message || message === "No activity recorded yet") return null;
  const createdAtIso = entry.createdAt ?? entry.time;
  return {
    id: entry.id ?? `activity-${index}`,
    message,
    time: formatActivityTime(createdAtIso),
    createdAtIso,
    type: entry.type,
    authorName: entry.createdBy?.fullName,
  };
}

export function apiTaskToTask(api: ApiTask): Task {
  const assigneeActors = getAssigneeActors(api);
  const assignees = assigneeActors.map((actor) => {
    const name = actor.fullName ?? actor.name ?? actor.email ?? "Unknown";
    return {
      id: actor.id,
      initials: actor.initials ?? initialsFromName(name),
      name,
      avatarUrl: actor.avatarUrl,
      roleTitle: actor.roleTitle,
    };
  });
  const activity = (api.activities ?? api.activity ?? [])
    .map(mapActivity)
    .filter(Boolean) as TaskActivity[];

  if (api.createdAt) {
    activity.push({
      id: `meta-created-${api.id}`,
      message: "Task created",
      time: formatActivityTime(api.createdAt),
      createdAtIso: api.createdAt,
      type: "CREATED",
    });
  }

  return {
    id: api.id,
    title: api.title,
    description: api.description ?? "",
    status: normalizeStatus(api.status),
    priority: normalizePriority(api.priority),
    assignees,
    assigneeId: api.assigneeId ?? api.assignee?.id ?? assigneeActors[0]?.id,
    assigneeIds: assigneeActors.map((actor) => actor.id).filter(Boolean) as string[],
    dueDate: formatDueDate(api.dueDate),
    dueDateIso: api.dueDate ?? null,
    subtasks: (api.subtasks ?? []).map(apiSubtaskToSubtask),
    activity: activity.sort(
      (a, b) =>
        new Date(b.createdAtIso ?? 0).getTime() -
        new Date(a.createdAtIso ?? 0).getTime(),
    ),
    projectId: api.projectId,
    completedAt: api.completedAt ?? null,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

export function sortTasksByStatus(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const byStatus = statusSort[a.status] - statusSort[b.status];
    if (byStatus !== 0) return byStatus;
    const byPriority = prioritySort[a.priority] - prioritySort[b.priority];
    if (byPriority !== 0) return byPriority;
    return new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
  });
}

export function sortTasksInStatusColumn(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const byPriority = prioritySort[a.priority] - prioritySort[b.priority];
    if (byPriority !== 0) return byPriority;
    return new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
  });
}

export async function listTasksByProjectApi(projectId: string) {
  const response = await apiClient.get<ApiTaskListResponse>(`/api/tasks/project/${projectId}`);
  const list = Array.isArray(response.data)
    ? response.data
    : (response.data.tasks ??
      response.data.data ??
      response.data.items ??
      response.data.board?.tasks ??
      response.data.project?.tasks ??
      []);
  return sortTasksByStatus(list.map(apiTaskToTask));
}

export async function getTaskApi(taskId: string) {
  const response = await apiClient.get<ApiTask>(`/api/tasks/${taskId}`);
  return apiTaskToTask(response.data);
}

function createInputToPayload(projectId: string, input: CreateTaskInput) {
  return {
    title: input.title.trim(),
    projectId,
    description: input.description.trim() || undefined,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDateIso ?? undefined,
    subtasks: input.subtasks
      .map((subtask) => subtask.label.trim())
      .filter(Boolean)
      .map((title) => ({ title })),
  };
}

function taskToUpdatePayload(task: Task) {
  return {
    title: task.title.trim(),
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDateIso ?? null,
    completedAt: task.status === "Completed" ? new Date().toISOString() : undefined,
  };
}

export async function createTaskApi(projectId: string, input: CreateTaskInput) {
  const response = await apiClient.post<ApiTask>("/api/tasks", createInputToPayload(projectId, input));
  const task = apiTaskToTask(response.data);
  await syncTaskAssignees(task.id, [], input.assigneeIds);
  return getTaskApi(task.id);
}

export async function updateTaskApi(task: Task) {
  const current = await getTaskApi(task.id);
  const response = await apiClient.patch<ApiTask>(`/api/tasks/${task.id}`, taskToUpdatePayload(task));
  const saved = apiTaskToTask(response.data);
  await syncTaskAssignees(
    task.id,
    current.assignees.map((assignee) => assignee.id).filter(Boolean) as string[],
    task.assigneeIds ?? [],
  );
  await syncTaskSubtasks(task.id, current.subtasks, task.subtasks);
  return getTaskApi(saved.id);
}

export async function deleteTaskApi(taskId: string) {
  await apiClient.delete(`/api/tasks/${taskId}`);
}

async function assignTasksApi(taskIds: string[], userIds: string[]) {
  const validTaskIds = taskIds.filter(isUuid);
  const validUserIds = userIds.filter(isUuid);
  if (validTaskIds.length === 0 || validUserIds.length === 0) return;
  await apiClient.post(
    "/api/tasks/assign",
    validUserIds.length === 1
      ? { userId: validUserIds[0], taskIds: validTaskIds }
      : {
          assignments: validUserIds.map((userId) => ({
            userId,
            taskIds: validTaskIds,
          })),
        },
  );
}

async function unassignTaskApi(taskId: string, userId: string) {
  if (!isUuid(taskId) || !isUuid(userId)) return;
  await apiClient.delete(`/api/tasks/${taskId}/assignees/${userId}`);
}

async function syncTaskAssignees(taskId: string, currentUserIds: string[], nextUserIds: string[]) {
  const current = new Set(currentUserIds.filter(isUuid));
  const next = new Set(nextUserIds.filter(isUuid));
  const toAdd = [...next].filter((userId) => !current.has(userId));
  const toRemove = [...current].filter((userId) => !next.has(userId));
  await assignTasksApi([taskId], toAdd);
  await Promise.all(toRemove.map((userId) => unassignTaskApi(taskId, userId)));
}

async function syncTaskSubtasks(
  taskId: string,
  currentSubtasks: SubtaskItem[],
  nextSubtasks: SubtaskItem[],
) {
  const next = nextSubtasks
    .map((subtask) => ({
      ...subtask,
      label: subtask.label.trim(),
    }))
    .filter((subtask) => subtask.label.length > 0);
  const currentById = new Map(currentSubtasks.map((subtask) => [subtask.id, subtask]));
  const nextPersistedIds = new Set(next.map((subtask) => subtask.id).filter(isPersistedSubtaskId));

  await Promise.all(
    currentSubtasks
      .filter((subtask) => isPersistedSubtaskId(subtask.id) && !nextPersistedIds.has(subtask.id))
      .map((subtask) => deleteSubtaskApi(subtask.id)),
  );

  await Promise.all(
    next.map(async (subtask) => {
      if (!isPersistedSubtaskId(subtask.id)) {
        const created = await createSubtaskApi(taskId, subtask.label);
        if (subtask.done) await updateSubtaskApi(created.id, { isCompleted: true });
        return;
      }
      const current = currentById.get(subtask.id);
      if (!current) return;
      const patch: { title?: string; isCompleted?: boolean } = {};
      if (subtask.label !== current.label.trim()) patch.title = subtask.label;
      if (subtask.done !== current.done) patch.isCompleted = subtask.done;
      if (Object.keys(patch).length > 0) await updateSubtaskApi(subtask.id, patch);
    }),
  );
}
