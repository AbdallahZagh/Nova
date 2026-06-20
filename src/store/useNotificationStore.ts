import { create } from "zustand";
import type { AppNotification } from "@/api/notifications";

type NotificationState = {
  unreadCount: number;
  latest: AppNotification | null;
  setUnreadCount: (count: number) => void;
  pushRealtimeNotification: (notification: AppNotification) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  latest: null,

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),

  pushRealtimeNotification: (notification) =>
    set((state) => ({
      latest: notification,
      unreadCount: notification.isRead
        ? state.unreadCount
        : state.unreadCount + 1,
    })),

  markRead: () =>
    set((state) => ({
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllRead: () => set({ unreadCount: 0 }),
}));
