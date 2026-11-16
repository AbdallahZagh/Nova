import { apiFetch } from "@/lib/api/client";

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
  overdue?: boolean;
  project: TimelineProject;
  assignee?: TimelineAssignee | null;
  windowStart?: string;
  windowEnd?: string;
  windowLabel?: string;
};

export type TimelineSubscription = {
  id: string;
  /** Unique per charge date; a weekly subscription shares one `id` across many dates. */
  occurrenceKey?: string;
  service: string;
  plan?: string | null;
  amount: string;
  currency: string;
  status: string;
  occursAt: string;
  kind: "trial" | "renewal";
  overdue?: boolean;
};

export type TimelineResponse = {
  items: TimelineTask[];
  subscriptions: TimelineSubscription[];
};

export type TimelineQuery = {
  projectId?: string;
  filter?: TimelineFilter;
};

export async function getTimelineApi(
  query: TimelineQuery = {},
): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.filter) params.set("filter", query.filter);
  params.set("tzOffsetMinutes", String(new Date().getTimezoneOffset()));
  const qs = params.toString();
  const path = qs ? `/api/timeline?${qs}` : "/api/timeline";

  const data = await apiFetch<
    TimelineTask[] | { items?: TimelineTask[]; subscriptions?: TimelineSubscription[] }
  >(path);
  if (Array.isArray(data)) return { items: data, subscriptions: [] };
  return {
    items: data.items ?? [],
    subscriptions: data.subscriptions ?? [],
  };
}
