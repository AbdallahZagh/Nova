import { apiClient, publicApiClient } from "@/api/apiClient";

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
  const { data } = await publicApiClient.get<SystemStatus>("/api/system/status");
  return data;
}

export async function createSupportTicketApi(input: {
  title: string;
  body: string;
  category?: string;
  priority?: string;
  route?: string;
  platform?: string;
  appVersion?: string;
  file?: { uri: string; name: string; type: string };
}) {
  const body = new FormData();
  body.append("title", input.title);
  body.append("body", input.body);
  if (input.category) body.append("category", input.category);
  if (input.priority) body.append("priority", input.priority);
  if (input.route) body.append("route", input.route);
  if (input.platform) body.append("platform", input.platform);
  if (input.appVersion) body.append("appVersion", input.appVersion);
  if (input.file) body.append("file", input.file as unknown as Blob);
  const response = await apiClient.post("/api/support/tickets", body, {
    skipOfflineQueue: true,
  } as never);
  return response.data;
}
