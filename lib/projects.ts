export type ProjectStatus =
  | "Active"
  | "In Progress"
  | "Completed"
  | "Archived";

export type ProjectMemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type ProjectMember = {
  id?: string;
  userId?: string;
  initials: string;
  imageUrl?: string;
  name?: string;
  email?: string;
  username?: string;
  role: ProjectMemberRole;
};

export type ProjectTeamMember = ProjectMember;

export type ProjectOwner = {
  id: string;
  fullName: string;
  email?: string;
  username?: string;
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
  contributorIds: string[];
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
  contributorIds: string[];
  members?: { userId: string; role: Exclude<ProjectMemberRole, "OWNER"> }[];
};

export const PROJECT_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Archived", label: "Archive" },
];

export function projectStatusLabel(status: ProjectStatus): string {
  return (
    PROJECT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export const PROJECT_STATUS_SORT_ORDER: Record<ProjectStatus, number> = {
  Active: 0,
  "In Progress": 1,
  Completed: 2,
  Archived: 3,
};

export function sortProjectsByStatus(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const byStatus =
      PROJECT_STATUS_SORT_ORDER[a.status] - PROJECT_STATUS_SORT_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
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
