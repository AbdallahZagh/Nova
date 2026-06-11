"use client";

import { createContext, useContext } from "react";

export type NotificationContextValue = {
  unreadCount: number;
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
