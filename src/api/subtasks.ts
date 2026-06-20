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
