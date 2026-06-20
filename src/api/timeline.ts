import { apiClient } from "@/api/apiClient";

export type TimelineFilter =
  | "today"
  | "tomorrow"
  | "weekly"
  | "monthly"
  | "yearly";

export type TimelineProject = {
  id: string;
  name: string;
};

export type TimelineAssignee = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type TimelineTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  completedAt?: string | null;
  project: TimelineProject;
  assignee?: TimelineAssignee | null;
  windowStart?: string;
  windowEnd?: string;
  windowLabel?: string;
};

export type TimelineQuery = {
  projectId?: string;
  filter?: TimelineFilter;
};

export async function getTimelineApi(query: TimelineQuery = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.filter) params.set("filter", query.filter);

  const response = await apiClient.get<TimelineTask[] | { items?: TimelineTask[] }>(
    `/api/timeline${params.toString() ? `?${params.toString()}` : ""}`,
  );

  return Array.isArray(response.data) ? response.data : (response.data.items ?? []);
}
