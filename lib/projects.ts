import type { SelectOption } from "@/components/ui/fieldVariants";

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

export const PROJECT_CONTRIBUTORS: SelectOption[] = [
  { value: "1", label: "Ahmed M.", description: "Frontend" },
  { value: "2", label: "Sara K.", description: "Backend" },
  { value: "3", label: "Omar T.", description: "UI/UX" },
  { value: "4", label: "Lina K.", description: "Design" },
  { value: "5", label: "Devon N.", description: "DevOps" },
];

const CONTRIBUTOR_INITIALS: Record<string, string> = {
  "1": "AM",
  "2": "SK",
  "3": "OT",
  "4": "LK",
  "5": "DN",
};

export function contributorIdsToTeamMembers(ids: string[]): ProjectTeamMember[] {
  return ids.map((id) => ({
    initials: CONTRIBUTOR_INITIALS[id] ?? id.slice(0, 2).toUpperCase(),
    role: "MEMBER",
  }));
}

export function slugifyProjectId(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `project-${Date.now()}`
  );
}

export const initialProjects: Project[] = [
  {
    id: "nova-mobile-app",
    title: "Nova Mobile App",
    description:
      "Finalize onboarding, push notification flows, and usage analytics for v1 release.",
    progress: 78,
    status: "Archived",
    teamMembers: [{ initials: "AM", role: "OWNER" }, { initials: "LK", role: "MEMBER" }, { initials: "RS", role: "MEMBER" }],
    contributorIds: ["1", "4"],
  },
  {
    id: "billing-migration",
    title: "Billing Migration",
    description:
      "Move legacy subscriptions to the new billing service and validate invoice parity.",
    progress: 46,
    status: "Active",
    teamMembers: [{ initials: "DN", role: "OWNER" }, { initials: "FW", role: "MEMBER" }, { initials: "QA", role: "VIEWER" }],
    contributorIds: ["5", "2"],
  },
  {
    id: "client-portal-redesign",
    title: "Client Portal Redesign",
    description:
      "Refresh IA and visual system to improve client task visibility and navigation speed.",
    progress: 34,
    status: "Archived",
    teamMembers: [{ initials: "HM", role: "OWNER" }, { initials: "ZT", role: "MEMBER" }],
    contributorIds: ["3"],
  },
  {
    id: "automation-engine",
    title: "Automation Engine",
    description:
      "Ship workflow automations for recurring tasks, approvals, and cross-project handoffs.",
    progress: 89,
    status: "Active",
    teamMembers: [{ initials: "KL", role: "OWNER" }, { initials: "MV", role: "ADMIN" }, { initials: "JP", role: "MEMBER" }],
    contributorIds: ["1", "2", "3"],
  },
  {
    id: "security-audit-q3",
    title: "Security Audit Q3",
    description:
      "Complete access review, dependency scans, and remediation tracking across core services.",
    progress: 100,
    status: "Completed",
    teamMembers: [{ initials: "SE", role: "OWNER" }, { initials: "AL", role: "ADMIN" }],
    contributorIds: ["2"],
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base",
    description:
      "Build internal documentation hub for runbooks, onboarding, and release checklists.",
    progress: 62,
    status: "Active",
    teamMembers: [{ initials: "OP", role: "OWNER" }, { initials: "NB", role: "MEMBER" }, { initials: "CS", role: "VIEWER" }],
    contributorIds: ["3", "4"],
  },
];

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
