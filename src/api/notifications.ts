import { Platform } from "react-native";
import { apiClient } from "@/api/apiClient";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsResponse = {
  unreadCount: number;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  data: AppNotification[];
};

export async function saveDeviceTokenApi(token: string) {
  await apiClient.post("/api/device-tokens/save", {
    token,
    platform: Platform.OS,
  });
}

export async function listNotificationsApi(page = 1, limit = 20) {
  const { data } = await apiClient.get<NotificationsResponse>(
    "/api/device-tokens/notifications",
    { params: { page, limit } },
  );
  return data;
}

export async function markNotificationReadApi(notificationId?: string) {
  await apiClient.patch("/api/device-tokens/notifications/read", {
    ...(notificationId ? { notificationId } : {}),
  });
}
