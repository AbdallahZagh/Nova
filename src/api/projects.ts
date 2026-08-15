import { apiClient } from "@/api/apiClient";

export type ProjectStatus = "Active" | "In Progress" | "Completed" | "Archived";
export type ProjectMemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type EditableProjectMemberRole = Exclude<ProjectMemberRole, "OWNER">;

export type ProjectTeamMember = {
  id?: string;
  userId?: string;
  initials: string;
  imageUrl?: string;
  name?: string;
  email?: string;
  username?: string | null;
  role: ProjectMemberRole;
};

export type ProjectOwner = {
  id: string;
  fullName: string;
  email?: string;
  username?: string | null;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ProjectDueAssignee = {
  id?: string;
  name: string;
  initials: string;
  avatarUrl?: string | null;
};

export type ProjectOwnershipFilter = "All" | "Mine" | "Shared";

export type Project = {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: ProjectStatus;
  teamMembers: ProjectTeamMember[];
  ownerId?: string;
  owner?: ProjectOwner;
  totalTasks?: number;
  completedTasks?: number;
  totalSubtasks?: number;
  completedSubtasks?: number;
  overdueCount?: number;
  nextDueDate?: string | null;
  nextDueAssignees?: ProjectDueAssignee[];
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectFormInput = {
  title: string;
  description: string;
  status: ProjectStatus;
  members?: { userId: string; role: EditableProjectMemberRole }[];
};

type ApiProjectOwner = {
  id: string;
  fullName: string;
  email?: string;
  username?: string | null;
  avatarUrl?: string | null;
  roleTitle?: string;
};

type ApiProjectMember = {
  id?: string;
  userId?: string;
  fullName?: string;
  name?: string;
  email?: string;
  username?: string | null;
  initials?: string;
  avatarUrl?: string | null;
  role?: string;
  user?: {
    id?: string;
    fullName?: string;
    name?: string;
    email?: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
};

type ApiProjectDueAssignee = {
  id?: string;
  name?: string;
  fullName?: string;
  initials?: string;
  avatarUrl?: string | null;
};

type ApiProjectTaskSummary = {
  id: string;
  status: string;
  subtasks?: { id?: string; isCompleted?: boolean }[];
};

type ApiProject = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: string;
  owner?: ApiProjectOwner;
  members?: ApiProjectMember[];
  teamMembers?: ApiProjectMember[];
  project_members?: ApiProjectMember[];
  projectMembers?: ApiProjectMember[];
  tasks?: ApiProjectTaskSummary[];
  completionPercentage?: number;
  progress?: number;
  totalTasks?: number;
  completedTasks?: number;
  totalSubtasks?: number;
  completedSubtasks?: number;
  overdueCount?: number;
  nextDueDate?: string | null;
  nextDueAssignees?: ApiProjectDueAssignee[];
};

export const PROJECT_STATUS_OPTIONS: ProjectStatus[] = [
  "Active",
  "In Progress",
  "Completed",
  "Archived",
];

export function projectStatusLabel(status: ProjectStatus) {
  return status === "Archived" ? "Archive" : status;
}

const statusSortOrder: Record<ProjectStatus, number> = {
  Active: 0,
  "In Progress": 1,
  Completed: 2,
  Archived: 3,
};

function initialsFromName(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeMemberRole(raw?: string): ProjectMemberRole {
  const role = raw?.trim().toUpperCase();
  if (role === "OWNER") return "OWNER";
  if (role === "ADMIN") return "ADMIN";
  if (role === "VIEWER") return "VIEWER";
  return "MEMBER";
}

function normalizeStatus(raw: string): ProjectStatus {
  const status = raw.trim();
  if (status === "In Progress") return "In Progress";
  if (status === "Completed") return "Completed";
  if (
    status === "Archived" ||
    status === "Archive" ||
    status === "On Hold" ||
    status === "On hold"
  ) {
    return "Archived";
  }
  return "Active";
}

function mapMember(member: ApiProjectMember): ProjectTeamMember {
  const user = member.user;
  const fullName = user?.fullName ?? user?.name ?? member.fullName ?? member.name;
  const userId = member.userId ?? user?.id ?? member.id;

  return {
    id: member.id,
    userId,
    initials:
      member.initials ?? (fullName ? initialsFromName(fullName) : "??"),
    imageUrl: member.avatarUrl ?? user?.avatarUrl ?? undefined,
    name: fullName,
    email: member.email ?? user?.email,
    username: member.username ?? user?.username ?? null,
    role: normalizeMemberRole(member.role),
  };
}

function mapTeamMembers(project: ApiProject) {
  const list =
    project.project_members ??
    project.projectMembers ??
    project.members ??
    project.teamMembers ??
    [];
  const members = list.map(mapMember);
  if (members.length > 0) return members;
  if (!project.owner) return [];

  return [
    {
      initials: initialsFromName(project.owner.fullName),
      imageUrl: project.owner.avatarUrl ?? undefined,
      name: project.owner.fullName,
      userId: project.owner.id,
      email: project.owner.email,
      username: project.owner.username ?? null,
      role: "OWNER" as const,
    },
  ];
}

function resolveProgress(project: ApiProject) {
  if (project.completionPercentage != null) return Math.round(project.completionPercentage);
  if (project.progress != null) return Math.round(project.progress);
  const total = project.totalTasks ?? project.tasks?.length ?? 0;
  if (total > 0 && project.completedTasks != null) {
    return Math.round((project.completedTasks / total) * 100);
  }
  if (
    project.totalSubtasks != null &&
    project.totalSubtasks > 0 &&
    project.completedSubtasks != null
  ) {
    return Math.round((project.completedSubtasks / project.totalSubtasks) * 100);
  }
  return 0;
}

function mapProject(project: ApiProject): Project {
  return {
    id: project.id,
    title: project.name ?? project.title ?? "Untitled",
    description: project.description ?? "",
    progress: Math.max(0, Math.min(100, resolveProgress(project))),
    status: normalizeStatus(project.status),
    teamMembers: mapTeamMembers(project),
    ownerId: project.ownerId ?? project.owner?.id,
    owner: project.owner,
    totalTasks: project.totalTasks ?? project.tasks?.length,
    completedTasks: project.completedTasks,
    totalSubtasks: project.totalSubtasks,
    completedSubtasks: project.completedSubtasks,
    overdueCount: project.overdueCount ?? 0,
    nextDueDate: project.nextDueDate ?? null,
    nextDueAssignees: (project.nextDueAssignees ?? []).map((assignee) => ({
      id: assignee.id,
      name: assignee.name ?? assignee.fullName ?? "Member",
      initials:
        assignee.initials ??
        initialsFromName(assignee.name ?? assignee.fullName ?? "NA"),
      avatarUrl: assignee.avatarUrl,
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function sortProjectsByStatus(projects: Project[]) {
  return [...projects].sort((a, b) => {
    const byStatus = statusSortOrder[a.status] - statusSortOrder[b.status];
    if (byStatus !== 0) return byStatus;
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

export function getProjectMemberRole(project: Project, userId?: string | null) {
  if (!userId) return null;
  if (project.ownerId === userId) return "OWNER";
  return (
    project.teamMembers.find(
      (member) => member.userId === userId || member.id === userId,
    )?.role ?? null
  );
}

export function canDeleteProject(role: ProjectMemberRole | null) {
  return role === "OWNER";
}

export function canEditProjectDetails(role: ProjectMemberRole | null) {
  return role !== null && role !== "VIEWER";
}

export function canManageProjectTeam(role: ProjectMemberRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

export function matchesOwnershipFilter(
  project: Project,
  filter: ProjectOwnershipFilter,
  userId?: string | null,
) {
  if (filter === "All") return true;
  const mine = Boolean(userId && project.ownerId === userId);
  return filter === "Mine" ? mine : !mine;
}

export function shouldOfferMarkProjectComplete(
  status: ProjectStatus,
  totalTasks: number,
  completedTasks: number,
) {
  if (status === "Completed" || status === "Archived") return false;
  if (totalTasks <= 0) return false;
  return completedTasks / totalTasks >= 0.8;
}

export function formatProjectLateCount(count?: number) {
  const n = Math.max(0, count ?? 0);
  if (n === 0) return "None late";
  return n === 1 ? "1 late" : `${n} late`;
}

export function formatProjectNextDue(iso?: string | null) {
  if (!iso) return "No upcoming";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No upcoming";
  return `Next ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function projectFormToPayload(input: ProjectFormInput) {
  return {
    name: input.title.trim(),
    description: input.description.trim() || undefined,
    status: input.status,
    members: input.members?.filter((member) => member.userId.trim()),
  };
}

function projectFormToUpdatePayload(input: ProjectFormInput) {
  return {
    name: input.title.trim(),
    description: input.description.trim() || undefined,
    status: input.status,
  };
}

export async function listProjectsApi() {
  const response = await apiClient.get<ApiProject[] | { projects: ApiProject[] }>(
    "/api/projects",
  );
  const list = Array.isArray(response.data)
    ? response.data
    : (response.data.projects ?? []);
  return sortProjectsByStatus(list.map(mapProject));
}

export async function getProjectApi(id: string) {
  const response = await apiClient.get<ApiProject>(`/api/projects/${id}`);
  return mapProject(response.data);
}

export async function createProjectApi(input: ProjectFormInput) {
  const requestedMembers = input.members?.filter((member) => member.userId.trim()) ?? [];
  const response = await apiClient.post<ApiProject>(
    "/api/projects",
    projectFormToPayload(input),
  );
  let project = mapProject(response.data);

  if (requestedMembers.length === 0) return project;

  project = await getProjectApi(project.id).catch(() => project);
  const existingMemberIds = new Set(
    project.teamMembers
      .map((member) => member.userId ?? member.id)
      .filter(Boolean),
  );
  const missingMembers = requestedMembers.filter(
    (member) => !existingMemberIds.has(member.userId),
  );

  if (missingMembers.length > 0) {
    await addProjectMembersApi(project.id, missingMembers);
    project = await getProjectApi(project.id).catch(() => project);
  }

  return project;
}

export async function updateProjectApi(id: string, input: ProjectFormInput) {
  const response = await apiClient.patch<ApiProject>(
    `/api/projects/${id}`,
    projectFormToUpdatePayload(input),
  );
  return mapProject(response.data);
}

export async function deleteProjectApi(id: string) {
  await apiClient.delete(`/api/projects/${id}`);
}

export async function addProjectMembersApi(
  projectId: string,
  members: { userId: string; role: EditableProjectMemberRole }[],
) {
  const validMembers = members.filter((member) => member.userId.trim());
  if (validMembers.length === 0) return;
  await apiClient.post(
    `/api/projects/${projectId}/members`,
    validMembers.length === 1 ? validMembers[0] : { members: validMembers },
  );
}

export async function updateProjectMemberRoleApi(
  projectId: string,
  userId: string,
  role: EditableProjectMemberRole,
) {
  await apiClient.patch(`/api/projects/${projectId}/members/${userId}`, { role });
}

export async function deleteProjectMemberApi(projectId: string, userId: string) {
  await apiClient.delete(`/api/projects/${projectId}/members/${userId}`);
}

export type ProjectActivityItem = {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  authorName: string;
  taskId?: string;
  taskTitle?: string;
};

export async function listProjectActivityApi(projectId: string, limit = 12) {
  const response = await apiClient.get<
    Array<{
      id: string;
      type?: string;
      content?: string;
      createdAt?: string;
      author?: { id?: string; name?: string; fullName?: string } | null;
      task?: { id?: string; title?: string } | null;
    }>
  >(`/api/projects/${projectId}/activity`, { params: { limit } });
  return (Array.isArray(response.data) ? response.data : []).map((item) => ({
    id: item.id,
    type: item.type ?? "ACTIVITY",
    content: item.content ?? "",
    createdAt: item.createdAt ?? "",
    authorName: item.author?.name ?? item.author?.fullName ?? "Someone",
    taskId: item.task?.id,
    taskTitle: item.task?.title,
  }));
}
