"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@/components/providers/UserProvider";
import { NotificationContext } from "@/components/providers/notification-context";
import { useNotificationSync } from "@/components/notifications/useNotificationSync";
import {
  listNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type AppNotification,
} from "@/lib/api/notifications";

const NOTIFICATIONS_LIMIT = 20;

function sortNotifications(items: AppNotification[]) {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function mergeNotifications(
  current: AppNotification[],
  incoming: AppNotification[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return sortNotifications([...byId.values()]);
}

function NotificationSyncBridge() {
  const { profile } = useUser();
  useNotificationSync(profile);
  return null;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const { profile } = useUser();

  const pushNotification = useCallback((notification: AppNotification) => {
    setNotifications((items) => {
      const next = items.filter((item) => item.id !== notification.id);
      return sortNotifications([notification, ...next]);
    });
  }, []);

  const refreshNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listNotificationsApi(1, NOTIFICATIONS_LIMIT);
      setNotifications(sortNotifications(response.data));
      setUnreadCount(response.unreadCount);
      setPage(response.page);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch {
      /* Drawer can still show realtime notifications captured this session. */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreNotifications = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const response = await listNotificationsApi(page + 1, NOTIFICATIONS_LIMIT);
      setNotifications((items) => mergeNotifications(items, response.data));
      setUnreadCount(response.unreadCount);
      setPage(response.page);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, page, totalPages]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target || target.isRead) return;

    setNotifications((items) =>
      items.map((item) =>
        item.id === notificationId ? { ...item, isRead: true } : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      await markNotificationReadApi(notificationId);
    } catch {
      setNotifications((items) =>
        items.map((item) =>
          item.id === notificationId ? { ...item, isRead: false } : item,
        ),
      );
      setUnreadCount((count) => count + 1);
    }
  }, [notifications]);

  const markAllNotificationsRead = useCallback(async () => {
    const previous = notifications;
    const previousUnread = unreadCount;
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsReadApi();
    } catch {
      setNotifications(previous);
      setUnreadCount(previousUnread);
    }
  }, [notifications, unreadCount]);

  useEffect(() => {
    if (!profile?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load notification history after auth profile is known
    void refreshNotifications();
  }, [profile?.id, refreshNotifications]);

  const incrementUnread = useCallback(() => {
    setUnreadCount((count) => count + 1);
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      loading,
      loadingMore,
      hasMore: page < totalPages,
      page,
      total,
      refreshNotifications,
      loadMoreNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      pushNotification,
      incrementUnread,
      resetUnread,
    }),
    [
      unreadCount,
      notifications,
      loading,
      loadingMore,
      page,
      total,
      totalPages,
      refreshNotifications,
      loadMoreNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      pushNotification,
      incrementUnread,
      resetUnread,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      <NotificationSyncBridge />
      {children}
    </NotificationContext.Provider>
  );
}
