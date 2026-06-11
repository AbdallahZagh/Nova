"use client";

import { createContext, useContext } from "react";
import type { AppNotification } from "@/lib/api/notifications";

export type NotificationContextValue = {
  unreadCount: number;
  notifications: AppNotification[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  page: number;
  total: number;
  refreshNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  pushNotification: (notification: AppNotification) => void;
  incrementUnread: () => void;
  resetUnread: () => void;
};

export const NotificationContext =
  createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
