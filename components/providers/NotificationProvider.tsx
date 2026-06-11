"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@/components/providers/UserProvider";
import { NotificationContext } from "@/components/providers/notification-context";
import { useNotificationSync } from "@/components/notifications/useNotificationSync";

function NotificationSyncBridge() {
  const { profile } = useUser();
  useNotificationSync(profile);
  return null;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnread = useCallback(() => {
    setUnreadCount((count) => count + 1);
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({ unreadCount, incrementUnread, resetUnread }),
    [unreadCount, incrementUnread, resetUnread],
  );

  return (
    <NotificationContext.Provider value={value}>
      <NotificationSyncBridge />
      {children}
    </NotificationContext.Provider>
  );
}
