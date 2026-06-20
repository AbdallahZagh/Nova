import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import {
  listNotificationsApi,
  markNotificationReadApi,
  type AppNotification,
} from "@/api/notifications";
import { getApiErrorMessage } from "@/api/apiClient";
import { NOTIFICATION_PAGE_SIZE } from "@/config/notifications";
import { PageSkeleton } from "@/components/Skeleton";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationCard({
  notification,
  selected,
  onPress,
}: {
  notification: AppNotification;
  selected: boolean;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-nova-xl border p-4 active:opacity-75 ${
        selected
          ? "border-accent bg-accent/10 dark:border-dark-accent dark:bg-dark-accent/10"
          : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View className="relative h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name="notifications-outline" size={21} color={palette.accent} />
          {!notification.isRead ? (
            <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent dark:bg-dark-accent" />
          ) : null}
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-3">
            <Text
              numberOfLines={2}
              className="flex-1 text-[15px] font-black text-primary dark:text-dark-primary"
            >
              {notification.title}
            </Text>
            <Text className="text-[10px] font-bold text-muted dark:text-dark-muted">
              {formatDate(notification.createdAt)}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted"
          >
            {notification.message}
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <Text className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-black uppercase text-accent dark:border-dark-accent/40 dark:bg-dark-accent/10 dark:text-dark-accent">
              {notification.type}
            </Text>
            <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
              {notification.isRead ? "Read" : "Unread"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function NotificationDetails({
  notification,
}: {
  notification: AppNotification | null;
}) {
  if (!notification) {
    return (
      <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
        <Ionicons name="mail-open-outline" size={34} color="#c56010" />
        <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
          Select a notification
        </Text>
        <Text className="mt-1 text-center text-sm leading-5 text-muted dark:text-dark-muted">
          Open an item to read the full message and metadata.
        </Text>
      </View>
    );
  }

  return (
    <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
      <View className="flex-row items-start gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name="notifications" size={22} color="#c56010" />
        </View>
        <View className="flex-1">
          <Text className="text-[20px] font-black text-primary dark:text-dark-primary">
            {notification.title}
          </Text>
          <Text className="mt-1 text-xs font-bold text-muted dark:text-dark-muted">
            {formatDate(notification.createdAt)}
          </Text>
        </View>
      </View>

      <Text className="mt-5 text-[15px] leading-6 text-primary dark:text-dark-primary">
        {notification.message}
      </Text>

      <View className="mt-5 flex-row flex-wrap gap-2">
        <Text className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-black uppercase text-accent dark:border-dark-accent/40 dark:bg-dark-accent/10 dark:text-dark-accent">
          {notification.type}
        </Text>
        <Text className="rounded-full border border-glass bg-glass-button px-3 py-1.5 text-[11px] font-black text-muted dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-muted">
          {notification.isRead ? "Read" : "Unread"}
        </Text>
      </View>

      {notification.metadata ? (
        <View className="mt-5 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
          <Text className="text-xs font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
            Metadata
          </Text>
          <Text className="mt-3 font-mono text-xs leading-5 text-muted dark:text-dark-muted">
            {JSON.stringify(notification.metadata, null, 2)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function NotificationsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const setUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const markReadInStore = useNotificationStore((state) => state.markRead);
  const markAllReadInStore = useNotificationStore((state) => state.markAllRead);
  const latest = useNotificationStore((state) => state.latest);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadPage = useCallback(
    async (nextPage: number, replace = false) => {
      const response = await listNotificationsApi(
        nextPage,
        NOTIFICATION_PAGE_SIZE,
      );
      setUnreadCount(response.unreadCount);
      setTotal(response.total ?? response.data.length);
      setTotalPages(response.totalPages ?? 1);
      setPage(response.page ?? nextPage);
      setItems((current) => {
        if (replace) return response.data;
        const byId = new Map(current.map((item) => [item.id, item]));
        response.data.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
    },
    [setUnreadCount],
  );

  const loadInitial = useCallback(async () => {
    try {
      await loadPage(1, true);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load notifications",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [loadPage, showSnackbar]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!latest) return;
    setItems((current) => {
      if (current.some((item) => item.id === latest.id)) return current;
      return [latest, ...current];
    });
  }, [latest]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(1, true).catch((error) => {
      showSnackbar({
        variant: "error",
        title: "Could not refresh",
        message: getApiErrorMessage(error, "Please try again."),
      });
    });
    setRefreshing(false);
  }, [loadPage, showSnackbar]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadPage(page + 1).catch((error) => {
      showSnackbar({
        variant: "error",
        title: "Could not load more",
        message: getApiErrorMessage(error, "Please try again."),
      });
    });
    setLoadingMore(false);
  }, [loadPage, loadingMore, page, showSnackbar, totalPages]);

  const openNotification = useCallback(
    async (notification: AppNotification) => {
      setSelectedId(notification.id);
      if (notification.isRead) return;

      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      markReadInStore(notification.id);
      await markNotificationReadApi(notification.id).catch((error) => {
        showSnackbar({
          variant: "error",
          title: "Could not mark as read",
          message: getApiErrorMessage(error, "Please try again."),
        });
      });
    },
    [markReadInStore, showSnackbar],
  );

  const markAll = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    markAllReadInStore();
    await markNotificationReadApi().catch((error) => {
      showSnackbar({
        variant: "error",
        title: "Could not mark all as read",
        message: getApiErrorMessage(error, "Please try again."),
      });
    });
  }, [markAllReadInStore, showSnackbar]);

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-32"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        onScroll={({ nativeEvent }) => {
          const paddingToBottom = 80;
          const nearBottom =
            nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - paddingToBottom;
          if (nearBottom) void loadMore();
        }}
        scrollEventThrottle={250}
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
                Notifications
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                {items.length} of {total || items.length} updates loaded.
              </Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
              <Ionicons name="notifications-outline" size={24} color={palette.accent} />
            </View>
          </View>

          <View className="mt-5 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={markAll}
              className="min-h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button px-3 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="checkmark-done-outline" size={18} color={palette.accent} />
              <Text className="text-sm font-black text-primary dark:text-dark-primary">
                Read all
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              className="min-h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button px-3 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="refresh-outline" size={18} color={palette.accent} />
              <Text className="text-sm font-black text-primary dark:text-dark-primary">
                Refresh
              </Text>
            </Pressable>
          </View>
        </View>

        <NotificationDetails notification={selected} />

        <View className="gap-3">
          <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
            Inbox
          </Text>

          {items.length === 0 ? (
            <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
              <Ionicons name="file-tray-outline" size={32} color={palette.accent} />
              <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
                No notifications yet
              </Text>
              <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
                New project, task, and team updates will appear here.
              </Text>
            </View>
          ) : (
            items.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                selected={notification.id === selectedId}
                onPress={() => void openNotification(notification)}
              />
            ))
          )}
        </View>

        {loadingMore ? <ActivityIndicator color={palette.accent} /> : null}
      </ScrollView>
    </View>
  );
}
