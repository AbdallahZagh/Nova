import { apiFetch } from "@/lib/api/client";
import type {
  Project,
  ProjectFormInput,
  ProjectMemberRole,
  ProjectOwner,
  ProjectStatus,
  ProjectTeamMember,
} from "@/lib/projects";
import { sortProjectsByStatus } from "@/lib/projects";

export type ApiProjectOwner = {
  id: string;
  fullName: string;
  email?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ApiProjectMember = {
  id?: string;
  userId?: string;
  fullName?: string;
  name?: string;
  email?: string;
  initials?: string;
  avatarUrl?: string | null;
  role?: string;
  user?: {
    id?: string;
    fullName?: string;
    name?: string;
    email?: string;
    avatarUrl?: string | null;
  };
};

export type ApiProjectTaskSummary = {
  id: string;
  status: string;
  subtasks?: Array<{ id?: string; isCompleted?: boolean }>;
};

export type ApiProject = {
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
};

function initialsFromName(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
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
  const s = raw.trim();
  if (s === "In Progress") return "In Progress";
  if (s === "Completed") return "Completed";
  if (
    s === "Archived" ||
    s === "Archive" ||
    s === "On Hold" ||
    s === "On hold"
  ) {
    return "Archived";
  }
  if (s === "Active") return "Active";
  return "Active";
}

function mapOwner(api: ApiProjectOwner): ProjectOwner {
  return {
    id: api.id,
    fullName: api.fullName,
    email: api.email,
    avatarUrl: api.avatarUrl,
    roleTitle: api.roleTitle,
  };
}

function mapMember(m: ApiProjectMember): ProjectTeamMember {
  const user = m.user;
  const fullName = user?.fullName ?? user?.name ?? m.fullName ?? m.name;
  const userId = m.userId ?? user?.id ?? m.id;
  return {
    id: m.id,
    userId,
    initials:
      m.initials ??
      (fullName ? initialsFromName(fullName) : "??"),
    imageUrl: m.avatarUrl ?? user?.avatarUrl ?? undefined,
    name: fullName,
    email: m.email ?? user?.email,
    role: normalizeMemberRole(m.role),
  };
}

function mapTeamMembers(api: ApiProject): ProjectTeamMember[] {
  const list =
    api.project_members ?? api.projectMembers ?? api.members ?? api.teamMembers ?? [];
  const members = list.map(mapMember);
  if (members.length > 0) return members;
  if (api.owner) {
    return [
      {
        initials: initialsFromName(api.owner.fullName),
        imageUrl: api.owner.avatarUrl ?? undefined,
        name: api.owner.fullName,
        userId: api.owner.id,
        email: api.owner.email,
        role: "OWNER",
      },
    ];
  }
  return [];
}

function resolveProgress(api: ApiProject): number {
  if (api.completionPercentage != null) {
    return Math.round(api.completionPercentage);
  }
  if (api.progress != null) {
    return Math.round(api.progress);
  }
  const total = api.totalTasks ?? api.tasks?.length ?? 0;
  if (total > 0 && api.completedTasks != null) {
    return Math.round((api.completedTasks / total) * 100);
  }
  if (
    api.totalSubtasks != null &&
    api.totalSubtasks > 0 &&
    api.completedSubtasks != null
  ) {
    return Math.round((api.completedSubtasks / api.totalSubtasks) * 100);
  }
  return 0;
}

export function apiProjectToProject(api: ApiProject): Project {
  return {
    id: api.id,
    title: api.name ?? api.title ?? "Untitled",
    description: api.description ?? "",
    progress: Math.max(0, Math.min(100, resolveProgress(api))),
    status: normalizeStatus(api.status),
    teamMembers: mapTeamMembers(api),
    contributorIds: [],
    ownerId: api.ownerId ?? api.owner?.id,
    owner: api.owner ? mapOwner(api.owner) : undefined,
    totalTasks: api.totalTasks ?? api.tasks?.length,
    completedTasks: api.completedTasks,
    totalSubtasks: api.totalSubtasks,
    completedSubtasks: api.completedSubtasks,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

export async function listProjectsApi() {
  const data = await apiFetch<ApiProject[] | { projects: ApiProject[] }>(
    "/api/projects",
  );
  const list = Array.isArray(data) ? data : (data.projects ?? []);
  return sortProjectsByStatus(list.map(apiProjectToProject));
}

export type CreateProjectPayload = {
  name: string;
  description?: string;
  status: string;
  members?: { userId: string; role: Exclude<ProjectMemberRole, "OWNER"> }[];
};

export type UpdateProjectPayload = {
  name?: string;
  description?: string;
  status?: string;
};

export function projectFormToPayload(input: ProjectFormInput): CreateProjectPayload {
  const payload: CreateProjectPayload = {
    name: input.title.trim(),
    description: input.description.trim() || undefined,
    status: input.status,
  };
  const members = input.members?.filter((member) => member.userId.trim()) ?? [];
  if (members.length > 0) {
    payload.members = members;
  }
  return payload;
}

export function projectFormToUpdatePayload(
  input: ProjectFormInput,
): UpdateProjectPayload {
  return {
    name: input.title.trim(),
    description: input.description.trim() || undefined,
    status: input.status,
  };
}

export async function getProjectApi(id: string) {
  const data = await apiFetch<ApiProject>(`/api/projects/${id}`);
  return apiProjectToProject(data);
}

export async function createProjectApi(input: ProjectFormInput) {
  const requestedMembers =
    input.members?.filter((member) => member.userId.trim()) ?? [];
  const data = await apiFetch<ApiProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify(projectFormToPayload(input)),
  });
  let project = apiProjectToProject(data);

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
  const data = await apiFetch<ApiProject>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(projectFormToUpdatePayload(input)),
  });
  return apiProjectToProject(data);
}

export async function deleteProjectApi(id: string) {
  await apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" });
}

export async function addProjectMembersApi(
  projectId: string,
  members: { userId: string; role: Exclude<ProjectMemberRole, "OWNER"> }[],
) {
  const validMembers = members.filter((member) => member.userId.trim());
  if (validMembers.length === 0) return;
  await apiFetch<void>(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(
      validMembers.length === 1
        ? validMembers[0]
        : { members: validMembers },
    ),
  });
}

export async function updateProjectMemberRoleApi(
  projectId: string,
  userId: string,
  role: Exclude<ProjectMemberRole, "OWNER">,
) {
  await apiFetch<void>(
    `/api/projects/${projectId}/members/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
}

export async function deleteProjectMemberApi(projectId: string, userId: string) {
  await apiFetch<void>(
    `/api/projects/${projectId}/members/${userId}`,
    { method: "DELETE" },
  );
}
