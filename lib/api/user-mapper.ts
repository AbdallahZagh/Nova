import type { ApiUser } from "@/lib/api/types";
import type { UserProfile } from "@/components/providers/UserProvider";
import { normalizeUsername } from "@/lib/username";

const PROJECT_COUNT_KEYS = [
  "projectCount",
  "projectsCount",
  "totalProjects",
  "project_count",
  "projects_count",
  "total_projects",
] as const;

const TASK_COUNT_KEYS = [
  "taskCount",
  "tasksCount",
  "totalTasks",
  "task_count",
  "tasks_count",
  "total_tasks",
] as const;

function pickNumber(source: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return 0;
}

function extractCounts(user: ApiUser): { projectCount: number; taskCount: number } {
  const root = user as Record<string, unknown>;
  const meta =
    typeof root._meta === "object" && root._meta !== null
      ? (root._meta as Record<string, unknown>)
      : null;
  const stats =
    typeof root.stats === "object" && root.stats !== null
      ? (root.stats as Record<string, unknown>)
      : null;

  return {
    projectCount:
      pickNumber(root, PROJECT_COUNT_KEYS) ||
      (meta ? pickNumber(meta, PROJECT_COUNT_KEYS) : 0) ||
      (stats ? pickNumber(stats, PROJECT_COUNT_KEYS) : 0),
    taskCount:
      pickNumber(root, TASK_COUNT_KEYS) ||
      (meta ? pickNumber(meta, TASK_COUNT_KEYS) : 0) ||
      (stats ? pickNumber(stats, TASK_COUNT_KEYS) : 0),
  };
}

export function apiUserToProfile(user: ApiUser): UserProfile {
  const { projectCount, taskCount } = extractCounts(user);

  const rawUsername =
    typeof user.username === "string" ? user.username : "";

  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    username: rawUsername ? normalizeUsername(rawUsername) : "",
    role: user.roleTitle,
    bio: user.bio ?? "",
    avatarUrl: user.avatarUrl ?? null,
    isDemo: Boolean(user.isDemo),
    accountRole:
      user.accountRole === "SUPER_ADMIN" || user.role === "SUPER_ADMIN"
        ? "SUPER_ADMIN"
        : "USER",
    projectCount,
    taskCount,
    activity: user.activity ?? {},
    projects: (user.projects ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      role: project.role,
      totalTasksCount: project.totalTasksCount ?? 0,
      userTasksCount: project.userTasksCount ?? 0,
      completedUserTasksCount: project.completedUserTasksCount ?? 0,
    })),
  };
}

export function profileToUpdatePayload(
  profile: Pick<
    UserProfile,
    "name" | "username" | "role" | "bio" | "avatarUrl"
  >,
) {
  const username = profile.username
    ? normalizeUsername(profile.username)
    : undefined;

  return {
    fullName: profile.name,
    roleTitle: profile.role,
    bio: profile.bio,
    ...(username ? { username } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  };
}
