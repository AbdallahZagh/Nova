import { apiFetch } from "@/lib/api/client";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
};

type NotificationsResponse =
  | {
      unreadCount: number;
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
      data: AppNotification[];
    }
  | AppNotification[];

export type NotificationPage = {
  unreadCount: number;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: AppNotification[];
};

export async function listNotificationsApi(page = 1, limit = 20) {
  const data = await apiFetch<NotificationsResponse>(
    `/api/device-tokens/notifications?page=${page}&limit=${limit}`,
  );

  if (Array.isArray(data)) {
    return {
      unreadCount: data.filter((item) => !item.isRead).length,
      page,
      limit,
      total: data.length,
      totalPages: 1,
      data,
    };
  }

  return {
    unreadCount: data.unreadCount,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    total: data.total ?? data.data.length,
    totalPages: data.totalPages ?? 1,
    data: data.data,
  };
}

export async function markNotificationReadApi(notificationId: string) {
  return apiFetch<{ message?: string }>(
    "/api/device-tokens/notifications/read",
    {
      method: "PATCH",
      body: JSON.stringify({ notificationId }),
    },
  );
}

export async function markAllNotificationsReadApi() {
  return apiFetch<{ message?: string }>(
    "/api/device-tokens/notifications/read",
    {
      method: "PATCH",
      body: JSON.stringify({}),
    },
  );
}
