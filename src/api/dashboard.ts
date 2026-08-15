import { apiClient } from "@/api/apiClient";
import type { Href } from "expo-router";

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

export function taskHref(
  projectId: string | null | undefined,
  taskId: string,
): Href | null {
  if (!taskId) return null;
  if (projectId) {
    return {
      pathname: "/task/[id]",
      params: { id: taskId, projectId },
    };
  }
  return `/(main)/task/${taskId}` as Href;
}

export async function getDashboardMetricsApi() {
  const response = await apiClient.get<DashboardMetrics>("/api/dashboard/metrics");
  return response.data;
}

export async function getDashboardActivityApi() {
  const response = await apiClient.get<ActivityMap>("/api/dashboard/activity");
  return response.data;
}

export async function getDashboardUrgentTasksApi() {
  const response = await apiClient.get<UrgentTask[]>(
    "/api/dashboard/urgent-tasks",
  );
  return response.data;
}

export async function getDashboardContinueApi() {
  const response = await apiClient.get<DashboardContinue>(
    "/api/dashboard/continue",
  );
  return response.data;
}
