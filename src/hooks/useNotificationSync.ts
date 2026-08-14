import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { saveDeviceTokenApi, type AppNotification } from "@/api/notifications";
import type { ApiUser } from "@/api/types";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/config/notifications";
import { hrefFromNotificationData } from "@/notifications/links";
import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

type ExpoNotificationsModule = typeof import("expo-notifications");
type ExpoDeviceModule = typeof import("expo-device");

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

async function loadNativeNotificationModules() {
  if (Platform.OS === "web" || isExpoGo()) {
    if (isExpoGo()) {
      console.log(
        "[Nova] Native push registration is skipped in Expo Go. Use a development build for closed-app push notifications.",
      );
    }
    return null;
  }

  const [Notifications, Device] = await Promise.all([
    import("expo-notifications"),
    import("expo-device"),
  ]);

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  return { Notifications, Device };
}

async function registerForPushNotifications({
  Notifications,
  Device,
}: {
  Notifications: ExpoNotificationsModule;
  Device: ExpoDeviceModule;
}) {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#e66a17",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const finalStatus =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") return null;

  const token = await Notifications.getDevicePushTokenAsync();
  return token.data;
}

function toNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    title: String(row.title ?? "Notification"),
    message: String(row.message ?? ""),
    type: String(row.type ?? "GENERAL"),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    isRead: Boolean(row.isRead),
    userId: String(row.userId),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

const handledPushResponseIds = new Set<string>();

export function useNotificationSync(user: ApiUser | null) {
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const pushRealtimeNotification = useNotificationStore(
    (state) => state.pushRealtimeNotification,
  );
  const setDeviceToken = useAuthStore((state) => state.setDeviceToken);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!user?.id) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let notificationSubscription: { remove: () => void } | null = null;
    let responseSubscription: { remove: () => void } | null = null;

    const openFromPushData = (data?: Record<string, unknown>) => {
      const key = String(data?.notificationId ?? data?.id ?? "");
      if (key) {
        if (handledPushResponseIds.has(key)) return;
        handledPushResponseIds.add(key);
      }
      const href = hrefFromNotificationData(
        String(data?.type ?? ""),
        data ?? null,
      );
      if (href) router.push(href);
    };

    channel = supabase
      .channel(`notification:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
          filter: `userId=eq.${user.id}`,
        },
        (payload) => {
          const notification = toNotification(payload.new);
          seenIds.current.add(notification.id);
          pushRealtimeNotification(notification);
          showSnackbar({
            variant: "info",
            title: notification.title,
            message: notification.message,
          });
        },
      )
      .subscribe();

    void loadNativeNotificationModules()
      .then(async (modules) => {
        if (!modules || cancelled) return;

        notificationSubscription =
          modules.Notifications.addNotificationReceivedListener((event) => {
            const data = event.request.content.data as
              | Record<string, unknown>
              | undefined;
            const id = String(data?.notificationId ?? data?.id ?? "");

            if (!id) {
              console.log(
                "[Nova] Foreground push skipped because payload has no notificationId. Supabase Realtime remains the in-app source.",
              );
              return;
            }

            if (seenIds.current.has(id)) return;
            seenIds.current.add(id);

            showSnackbar({
              variant: "info",
              title: event.request.content.title ?? "Notification",
              message: event.request.content.body ?? "",
            });
          });

        responseSubscription =
          modules.Notifications.addNotificationResponseReceivedListener(
            (response) => {
              const data = response.notification.request.content.data as
                | Record<string, unknown>
                | undefined;
              openFromPushData(data);
            },
          );

        const lastResponse =
          await modules.Notifications.getLastNotificationResponseAsync();
        if (!cancelled && lastResponse) {
          const data = lastResponse.notification.request.content.data as
            | Record<string, unknown>
            | undefined;
          openFromPushData(data);
        }

        const token = await registerForPushNotifications(modules);
        if (!token || cancelled || user.isDemo) return;
        console.log("[Nova] mobile push token:", token);
        await saveDeviceTokenApi(token);
        await setDeviceToken(token);
      })
      .catch((error) => {
        console.warn("[Nova] push registration failed:", error);
      });

    return () => {
      cancelled = true;
      notificationSubscription?.remove();
      responseSubscription?.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [pushRealtimeNotification, setDeviceToken, showSnackbar, user?.id, user?.isDemo]);
}
