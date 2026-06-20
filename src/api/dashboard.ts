import { apiClient } from "@/api/apiClient";

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

export type ActivityMap = Record<string, ActivityTaskEntry[]>;

export type UrgentTask = {
  id: string;
  title: string;
  projectName: string;
  priority: string;
  dueDate: string | null;
  dueLabel: string;
};

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
