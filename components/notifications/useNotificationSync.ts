"use client";

import { useCallback, useEffect, useRef } from "react";
import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { useNotifications } from "@/components/providers/notification-context";
import { useToast } from "@/components/ui/Toast";
import { saveDeviceTokenApi } from "@/lib/api/device-tokens";
import {
  FIREBASE_VAPID_KEY,
  getFirebaseMessaging,
  initFirebaseAnalytics,
  isValidFirebaseVapidKey,
} from "@/lib/firebase/client";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/api/notifications";

type NotificationUser = {
  id: string;
} | null;

type NotificationRow = AppNotification;

function notificationText(row: NotificationRow) {
  return {
    title: row.title.trim() || "Nova notification",
    message: row.message.trim() || "You have a new workspace update.",
  };
}

function payloadNotificationKey(payload: MessagePayload) {
  return (
    payload.data?.notificationId ||
    payload.data?.id ||
    `${payload.notification?.title ?? payload.data?.title ?? ""}:${payload.notification?.body ?? payload.data?.body ?? payload.data?.message ?? ""}`
  );
}

function rowNotificationKey(row: NotificationRow) {
  return row.id || `${row.title}:${row.message}`;
}

function rowContentKey(row: NotificationRow) {
  return `${row.title}:${row.message}`;
}

function payloadText(payload: MessagePayload) {
  return {
    title:
      payload.notification?.title ||
      payload.data?.title ||
      "Nova notification",
    message:
      payload.notification?.body ||
      payload.data?.body ||
      payload.data?.message ||
      "You have a new workspace update.",
  };
}

export function useNotificationSync(user: NotificationUser) {
  const { incrementUnread, pushNotification } = useNotifications();
  const { toast } = useToast();
  const tokenUserRef = useRef<string | null>(null);
  const handledNotificationsRef = useRef<Map<string, number>>(new Map());

  const markHandled = useCallback((key: string) => {
    const now = Date.now();
    handledNotificationsRef.current.set(key, now);
    for (const [itemKey, handledAt] of handledNotificationsRef.current) {
      if (now - handledAt > 10000) {
        handledNotificationsRef.current.delete(itemKey);
      }
    }
  }, []);

  const wasRecentlyHandled = useCallback((key: string) => {
    const handledAt = handledNotificationsRef.current.get(key);
    return Boolean(handledAt && Date.now() - handledAt < 5000);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = getSupabaseRealtimeClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`notification-sync:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
          filter: `userId=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          const { title, message } = notificationText(row);
          markHandled(rowNotificationKey(row));
          markHandled(rowContentKey(row));
          pushNotification(row);
          incrementUnread();
          toast({
            variant: "info",
            title,
            message,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [incrementUnread, markHandled, pushNotification, toast, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    if (tokenUserRef.current === userId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!isValidFirebaseVapidKey(FIREBASE_VAPID_KEY)) {
      console.warn(
        "Firebase push notifications are disabled because NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing or invalid.",
      );
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    async function setupMessaging() {
      await initFirebaseAnalytics().catch(() => null);

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (cancelled || permission !== "granted") return;

      const messaging = await getFirebaseMessaging();
      if (cancelled || !messaging || !("serviceWorker" in navigator)) return;

      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (cancelled || !token) return;

      console.info("[notifications] FCM token", token);
      await saveDeviceTokenApi(token);
      tokenUserRef.current = userId;

      unsubscribe = onMessage(messaging, (payload) => {
        const key = payloadNotificationKey(payload);
        window.setTimeout(() => {
          if (wasRecentlyHandled(key)) return;
          const { title, message } = payloadText(payload);
          markHandled(key);
          pushNotification({
            id: key || `fcm-${Date.now()}`,
            title,
            message,
            type: payload.data?.type ?? "PUSH",
            metadata: payload.data ?? null,
            isRead: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId,
          });
          incrementUnread();
          toast({
            variant: "info",
            title,
            message,
          });
        }, 1200);
      });
    }

    void setupMessaging();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [
    incrementUnread,
    markHandled,
    pushNotification,
    toast,
    user?.id,
    wasRecentlyHandled,
  ]);
}
