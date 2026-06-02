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
  projectName: string;
  completionPercentage: number;
};

/** ISO date key → tasks for that day */
export type ActivityMap = Record<string, ActivityTaskEntry[]>;

export type UrgentTask = {
  id: string;
  title: string;
  projectName: string;
  priority: string;
  dueDate: string | null;
  dueLabel: string;
};

export function getDashboardMetricsApi() {
  return apiFetch<DashboardMetrics>("/api/dashboard/metrics");
}

export function getDashboardActivityApi() {
  return apiFetch<ActivityMap>("/api/dashboard/activity");
}

export function getDashboardUrgentTasksApi() {
  return apiFetch<UrgentTask[]>("/api/dashboard/urgent-tasks");
}
