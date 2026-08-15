import { apiClient } from "@/api/apiClient";

export type ApiSubtaskUser = {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  initials?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ApiSubtaskAssignee = {
  assignedAt?: string;
  userId?: string;
  assigneeId?: string;
  user?: ApiSubtaskUser | null;
  assignee?: ApiSubtaskUser | null;
};

export type ApiSubtask = {
  id: string;
  title?: string;
  label?: string;
  isCompleted?: boolean;
  done?: boolean;
  isDone?: boolean;
  assignees?: (ApiSubtaskAssignee | ApiSubtaskUser)[];
  assignedUsers?: ApiSubtaskUser[];
  assignments?: ApiSubtaskAssignee[];
};

export type SubtaskAssignee = {
  id?: string;
  initials: string;
  name: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type SubtaskItem = {
  id: string;
  label: string;
  done: boolean;
  assignees: SubtaskAssignee[];
  assigneeIds: string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedSubtaskId(id: string) {
  return UUID_RE.test(id);
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

function isAssignment(
  value: ApiSubtaskAssignee | ApiSubtaskUser,
): value is ApiSubtaskAssignee {
  return "user" in value || "assignee" in value || "userId" in value || "assigneeId" in value;
}

function assignmentToUser(assignment: ApiSubtaskAssignee): ApiSubtaskUser {
  const user = assignment.user ?? assignment.assignee ?? {};
  return { ...user, id: user.id ?? assignment.userId ?? assignment.assigneeId };
}

function mapAssignee(user: ApiSubtaskUser): SubtaskAssignee {
  const name = user.fullName ?? user.name ?? user.email ?? "Unknown";
  return {
    id: user.id,
    initials: user.initials ?? initialsFromName(name),
    name,
    avatarUrl: user.avatarUrl,
    roleTitle: user.roleTitle,
  };
}

export function apiSubtaskToSubtask(api: ApiSubtask): SubtaskItem {
  const raw = api.assignees ?? api.assignedUsers ?? api.assignments ?? [];
  const assignees = raw.map((entry) =>
    mapAssignee(isAssignment(entry) ? assignmentToUser(entry) : entry),
  );

  return {
    id: api.id,
    label: api.label ?? api.title ?? "",
    done: Boolean(api.isCompleted ?? api.done ?? api.isDone),
    assignees,
    assigneeIds: assignees.map((assignee) => assignee.id).filter(Boolean) as string[],
  };
}

export async function createSubtaskApi(taskId: string, title: string) {
  const response = await apiClient.post<ApiSubtask>("/api/subtasks", {
    taskId,
    title: title.trim(),
  });
  return apiSubtaskToSubtask(response.data);
}

export async function updateSubtaskApi(
  id: string,
  patch: { title?: string; isCompleted?: boolean },
) {
  const body: Record<string, string | boolean> = {};
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.isCompleted !== undefined) body.isCompleted = patch.isCompleted;
  const response = await apiClient.patch<ApiSubtask>(`/api/subtasks/${id}`, body);
  return apiSubtaskToSubtask(response.data);
}

export async function deleteSubtaskApi(id: string) {
  await apiClient.delete(`/api/subtasks/${id}`);
}

type ApiSubtaskAssignmentResponse =
  | ApiSubtask
  | ApiSubtask[]
  | { subtask?: ApiSubtask; subtasks?: ApiSubtask[]; message?: string };

function responseToSubtasks(data: ApiSubtaskAssignmentResponse): SubtaskItem[] {
  if (Array.isArray(data)) return data.map(apiSubtaskToSubtask);
  if ("subtasks" in data && data.subtasks) {
    return data.subtasks.map(apiSubtaskToSubtask);
  }
  if ("subtask" in data && data.subtask) {
    return [apiSubtaskToSubtask(data.subtask)];
  }
  if ("id" in data) return [apiSubtaskToSubtask(data)];
  return [];
}

export async function assignSubtasksApi(subtaskIds: string[], userIds: string[]) {
  const validSubtaskIds = subtaskIds.filter(isPersistedSubtaskId);
  const validUserIds = userIds.filter(isPersistedSubtaskId);
  if (validSubtaskIds.length === 0 || validUserIds.length === 0) return [];

  const response = await apiClient.post<ApiSubtaskAssignmentResponse>("/api/subtasks/assign", 
    validUserIds.length === 1
      ? { userId: validUserIds[0], subtaskIds: validSubtaskIds }
      : {
          assignments: validUserIds.map((userId) => ({
            userId,
            subtaskIds: validSubtaskIds,
          })),
        },
  );
  return responseToSubtasks(response.data);
}

export async function unassignSubtaskApi(subtaskId: string, userId: string) {
  if (!isPersistedSubtaskId(subtaskId) || !isPersistedSubtaskId(userId)) return [];
  const response = await apiClient.delete<ApiSubtaskAssignmentResponse>(
    `/api/subtasks/${subtaskId}/assignees/${userId}`,
  );
  return responseToSubtasks(response.data);
}

export async function syncSubtaskAssigneesApi(
  subtaskId: string,
  currentUserIds: string[],
  nextUserIds: string[],
) {
  const current = new Set(currentUserIds.filter(isPersistedSubtaskId));
  const next = new Set(nextUserIds.filter(isPersistedSubtaskId));
  const toAdd = [...next].filter((userId) => !current.has(userId));
  const toRemove = [...current].filter((userId) => !next.has(userId));

  const assigned = await assignSubtasksApi([subtaskId], toAdd);
  const unassigned = await Promise.all(
    toRemove.map((userId) => unassignSubtaskApi(subtaskId, userId)),
  );
  return [...assigned, ...unassigned.flat()].find((subtask) => subtask.id === subtaskId);
}
