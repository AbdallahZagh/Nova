import type { ApiUser } from "@/lib/api/types";
import type { UserProfile } from "@/components/providers/UserProvider";

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

  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    role: user.roleTitle,
    bio: user.bio ?? "",
    avatarUrl: user.avatarUrl ?? null,
    projectCount,
    taskCount,
  };
}

export function profileToUpdatePayload(
  profile: Pick<UserProfile, "name" | "role" | "bio" | "avatarUrl">,
) {
  return {
    fullName: profile.name,
    roleTitle: profile.role,
    bio: profile.bio,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  };
}
