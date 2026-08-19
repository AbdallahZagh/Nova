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
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  listNotificationsApi,
  markNotificationReadApi,
  type AppNotification,
} from "@/api/notifications";
import { getApiErrorMessage } from "@/api/apiClient";
import { NOTIFICATION_PAGE_SIZE } from "@/config/notifications";
import { BottomDrawer } from "@/components/BottomDrawer";
import { PageSkeleton } from "@/components/Skeleton";
import {
  formatNotificationTime,
  formatNotificationType,
  groupNotificationsByDay,
  hrefFromNotification,
  notificationActionLabel,
  notificationKind,
  notificationTone,
  type NotificationKind,
  type NotificationTone,
} from "@/notifications/links";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

type InboxFilter = "all" | "unread";

const KIND_ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  overdue: "alert-circle-outline",
  due: "time-outline",
  mention: "at-outline",
  assigned: "person-add-outline",
  unassigned: "person-remove-outline",
  done: "checkmark-circle-outline",
  project: "people-outline",
  whiteboard: "brush-outline",
  comment: "chatbubble-ellipses-outline",
  default: "notifications-outline",
};

function toneColor(
  tone: NotificationTone,
  palette: ReturnType<typeof getPalette>,
) {
  if (tone === "warning") return palette.warning;
  if (tone === "success") return palette.success;
  if (tone === "muted") return palette.muted;
  return palette.accent;
}

function formatFullDate(raw?: string) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const kind = notificationKind(notification.type);
  const tone = notificationTone(notification.type);
  const color = toneColor(tone, palette);
  const unreadWarning = !notification.isRead && tone === "warning";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-nova-xl border p-4 active:opacity-75 ${
        selected
          ? "border-accent/60 bg-accent/10 dark:border-dark-accent/60 dark:bg-dark-accent/15"
          : unreadWarning
            ? "border-warning/50 bg-warning/10 dark:border-dark-warning/50 dark:bg-dark-warning/10"
            : notification.isRead
              ? "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
              : "border-accent/40 bg-accent/5 dark:border-dark-accent/40 dark:bg-dark-accent/10"
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View className="relative h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name={KIND_ICON[kind]} size={21} color={color} />
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
              {formatNotificationTime(notification.createdAt)}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted"
          >
            {notification.message}
          </Text>
          <Text
            className={`mt-3 self-start rounded-full border px-2 py-1 text-[10px] font-black ${
              tone === "warning"
                ? "border-warning/40 bg-warning/10 text-warning dark:border-dark-warning/40 dark:bg-dark-warning/10 dark:text-dark-warning"
                : tone === "success"
                  ? "border-success/40 bg-success/10 text-success dark:border-dark-success/40 dark:bg-dark-success/10 dark:text-dark-success"
                  : "border-accent/40 bg-accent/10 text-accent dark:border-dark-accent/40 dark:bg-dark-accent/10 dark:text-dark-accent"
            }`}
          >
            {formatNotificationType(notification.type)}
          </Text>
        </View>
      </View>
    </Pressable>
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
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.isRead) : items),
    [filter, items],
  );
  const groups = useMemo(() => groupNotificationsByDay(visible), [visible]);
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

  const openSelectedTarget = useCallback(() => {
    if (!selected) return;
    const href = hrefFromNotification(selected);
    setSelectedId(null);
    if (href) router.push(href);
  }, [selected]);

  const markAll = useCallback(async () => {
    if (unreadCount === 0) return;
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    markAllReadInStore();
    await markNotificationReadApi().catch((error) => {
      showSnackbar({
        variant: "error",
        title: "Could not mark all as read",
        message: getApiErrorMessage(error, "Please try again."),
      });
    });
  }, [markAllReadInStore, showSnackbar, unreadCount]);

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

          <View className="mt-5 flex-row gap-2">
            {(
              [
                { id: "all" as const, label: "All" },
                {
                  id: "unread" as const,
                  label: unreadCount > 0 ? `Unread ${unreadCount}` : "Unread",
                },
              ]
            ).map((chip) => (
              <Pressable
                key={chip.id}
                onPress={() => setFilter(chip.id)}
                className={`rounded-full border px-3 py-1.5 ${
                  filter === chip.id
                    ? "border-accent/50 bg-accent/15 dark:border-dark-accent/50 dark:bg-dark-accent/15"
                    : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    filter === chip.id
                      ? "text-accent dark:text-dark-accent"
                      : "text-primary dark:text-dark-primary"
                  }`}
                >
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-4 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={unreadCount === 0}
              onPress={markAll}
              className="min-h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button px-3 active:opacity-75 disabled:opacity-45 dark:border-dark-glass dark:bg-dark-glass-button"
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

        {visible.length === 0 ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Ionicons name="file-tray-outline" size={32} color={palette.accent} />
            <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
              {filter === "unread" ? "You're all caught up" : "No notifications yet"}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              {filter === "unread"
                ? "New updates will show up here."
                : "New project, task, and whiteboard updates will appear here."}
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label} className="gap-3">
              <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
                {group.label}
              </Text>
              {group.items.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  selected={selectedId === notification.id}
                  onPress={() => void openNotification(notification)}
                />
              ))}
            </View>
          ))
        )}

        {loadingMore ? <ActivityIndicator color={palette.accent} /> : null}
      </ScrollView>

      <BottomDrawer
        visible={Boolean(selected)}
        title="Notification"
        subtitle={
          selected
            ? `${formatNotificationType(selected.type)} · ${formatNotificationTime(selected.createdAt)}`
            : undefined
        }
        minHeight="42%"
        maxHeight="78%"
        onClose={() => setSelectedId(null)}
        footer={
          selected && notificationActionLabel(selected) ? (
            <Pressable
              accessibilityRole="button"
              onPress={openSelectedTarget}
              className="min-h-[48px] items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
            >
              <Text className="text-sm font-black text-white">
                {notificationActionLabel(selected)}
              </Text>
            </Pressable>
          ) : (
            <Text className="text-center text-sm font-bold text-muted dark:text-dark-muted">
              No further action needed.
            </Text>
          )
        }
      >
        {selected ? (
          <View className="gap-4">
            <Text className="text-[22px] font-black leading-7 text-primary dark:text-dark-primary">
              {selected.title}
            </Text>
            <Text className="text-[15px] leading-6 text-muted dark:text-dark-muted">
              {selected.message}
            </Text>
            <Text className="text-xs font-bold text-muted dark:text-dark-muted">
              {formatFullDate(selected.createdAt)}
            </Text>
          </View>
        ) : null}
      </BottomDrawer>
    </View>
  );
}
