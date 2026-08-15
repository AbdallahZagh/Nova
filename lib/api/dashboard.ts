import { apiFetch } from "@/lib/api/client";

export type DashboardMetrics = {
  tasksDueToday: number;
  activeProjectsCount: number;
  productivityPercentage: number;
  _meta?: {
    totalSubtasks?: number;
    completedSubtasks?: number;
    totalAssignedTasks?: number;
  };
};

export type ActivityTaskEntry = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  projectId?: string | null;
  projectName: string;
  completionPercentage: number;
};

/** ISO date key → tasks for that day */
export type ActivityMap = Record<string, ActivityTaskEntry[]>;

export type UrgentTask = {
  id: string;
  title: string;
  projectId?: string | null;
  projectName: string;
  priority: string;
  dueDate: string | null;
  dueLabel: string;
};

export type ContinueProject = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
};

export type ContinueWhiteboard = {
  id: string;
  title: string;
  projectId: string | null;
  lastEditedAt: string;
};

export type ContinueDueTodayTask = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  dueDate: string | null;
};

export type DashboardContinue = {
  lastProject: ContinueProject | null;
  lastWhiteboard: ContinueWhiteboard | null;
  dueToday: ContinueDueTodayTask[];
};

export function taskWorkspaceHref(
  projectId: string | null | undefined,
  taskId: string,
) {
  if (!projectId) return null;
  return `/projects/${projectId}?task=${taskId}`;
}

export function getDashboardMetricsApi() {
  return apiFetch<DashboardMetrics>("/api/dashboard/metrics");
}

export function getDashboardActivityApi() {
  return apiFetch<ActivityMap>("/api/dashboard/activity");
}

export function getDashboardUrgentTasksApi() {
  return apiFetch<UrgentTask[]>("/api/dashboard/urgent-tasks");
}

export function getDashboardContinueApi() {
  return apiFetch<DashboardContinue>("/api/dashboard/continue");
}
