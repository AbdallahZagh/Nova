import { apiFetch } from "@/lib/api/client";

export type SystemStatus = {
  maintenanceMode: boolean;
  banner: string | null;
  aiEnabled: boolean;
  registrationsEnabled: boolean;
  fcmEnabled: boolean;
};

export function systemSettingsRowToStatus(
  row: Record<string, unknown> | null | undefined,
): SystemStatus | null {
  if (!row) return null;
  const banner = row.broadcastBanner;
  return {
    maintenanceMode: Boolean(row.maintenanceMode),
    banner: typeof banner === "string" && banner.trim() ? banner : null,
    aiEnabled: row.aiEnabled !== false,
    registrationsEnabled: row.registrationsEnabled !== false,
    fcmEnabled: row.fcmEnabled !== false,
  };
}

export async function getSystemStatusApi() {
  return apiFetch<SystemStatus>("/api/system/status", { auth: false });
}

export async function createSupportTicketApi(input: {
  title: string;
  body: string;
  category?: string;
  priority?: string;
  route?: string;
  platform?: string;
  appVersion?: string;
  file?: File;
}) {
  const form = new FormData();
  form.append("title", input.title);
  form.append("body", input.body);
  if (input.category) form.append("category", input.category);
  if (input.priority) form.append("priority", input.priority);
  if (input.route) form.append("route", input.route);
  if (input.platform) form.append("platform", input.platform);
  if (input.appVersion) form.append("appVersion", input.appVersion);
  if (input.file) form.append("file", input.file);
  return apiFetch("/api/support/tickets", {
    method: "POST",
    body: form,
    skipOfflineQueue: true,
  });
}

export type AdminUserRow = {
  id: string;
  email: string;
  username: string | null;
  fullName: string;
  role: string;
  status: string;
  createdAt: string;
  lastActiveAt?: string | null;
  isDemo: boolean;
  isActive?: boolean;
  isArchived?: boolean;
};

export type AdminOverview = {
  counts: {
    users: number;
    activeUsers: number;
    projects: number;
    tasks: number;
    boards: number;
    openTickets: number;
    aiToday: number;
  };
  signupFunnel: { registered: number; verified: number; withProject: number };
  http: { requestsLastHour: number; errorRate: number; avgLatencyMs: number };
  storage: { configured: boolean; bytes: number };
  crons: Array<{
    name: string;
    lastStartedAt?: string | null;
    lastFinishedAt?: string | null;
    lastStatus?: string | null;
    lastError?: string | null;
  }>;
  integrations: {
    gemini: boolean;
    firebase: boolean;
    emailjs: boolean;
    supabase: boolean;
  };
  settings: {
    maintenanceMode: boolean;
    broadcastBanner: string | null;
    aiEnabled: boolean;
    defaultAiDailyQuota: number;
    registrationsEnabled: boolean;
    fcmEnabled: boolean;
    whiteboardRealtimeEnabled: boolean;
  };
};

export const adminApi = {
  overview: () => apiFetch<AdminOverview>("/api/admin/overview"),
  patchSettings: (body: Record<string, unknown>) =>
    apiFetch("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  users: (q = "", page = 1) =>
    apiFetch<{ data: AdminUserRow[]; total: number }>(
      `/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`,
    ),
  user: (id: string) => apiFetch<Record<string, unknown>>(`/api/admin/users/${id}`),
  action: (id: string, action: string) =>
    apiFetch(`/api/admin/users/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  demoOverview: () => apiFetch<Record<string, unknown>>("/api/admin/demo/overview"),
  demoSessions: (page = 1) =>
    apiFetch<{ data: Record<string, unknown>[]; total: number }>(
      `/api/admin/demo/sessions?page=${page}`,
    ),
  tickets: (params: Record<string, string> = {}) => {
    const search = new URLSearchParams(params);
    const query = search.toString();
    return apiFetch<{ data: Record<string, unknown>[]; total: number }>(
      `/api/admin/support/tickets${query ? `?${query}` : ""}`,
    );
  },
  ticket: (id: string) => apiFetch<Record<string, unknown>>(`/api/admin/support/tickets/${id}`),
  patchTicket: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/admin/support/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  replyTicket: (id: string, body: string, resolve?: boolean) =>
    apiFetch(`/api/admin/support/tickets/${id}/replies`, {
      method: "POST",
      body: JSON.stringify({ body, resolve }),
    }),
  broadcasts: () =>
    apiFetch<Record<string, unknown>[]>("/api/admin/notifications/broadcasts"),
  sendBroadcast: (body: Record<string, unknown>) =>
    apiFetch("/api/admin/notifications/broadcasts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  aiUsage: () => apiFetch<Record<string, unknown>>("/api/admin/ai/usage"),
  setQuota: (userId: string, dailyLimit: number) =>
    apiFetch(`/api/admin/ai/quotas/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ dailyLimit }),
    }),
  audit: (page = 1, action = "") => {
    const search = new URLSearchParams({ page: String(page) });
    if (action) search.set("action", action);
    return apiFetch<{ data: Record<string, unknown>[]; total: number }>(
      `/api/admin/audit?${search.toString()}`,
    );
  },
};
