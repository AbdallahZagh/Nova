import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  getDashboardSummaryApi,
  taskHref,
  type ActivityMap,
  type ActivityTaskEntry,
  type DashboardContinue,
  type DashboardMetrics,
  type UrgentTask,
} from "@/api/dashboard";
import { PageSkeleton } from "@/components/Skeleton";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function priorityColor(priority: string) {
  const normalized = priority.toLowerCase();
  if (normalized === "high") return "bg-danger dark:bg-dark-danger";
  if (normalized === "medium") return "bg-warning dark:bg-dark-warning";
  if (normalized === "low") return "bg-success dark:bg-dark-success";
  return "bg-subtle dark:bg-dark-subtle";
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
      <View className="mb-4 flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
          <Ionicons name={icon} size={18} color={palette.accent} />
        </View>
        <Text className="flex-1 text-[17px] font-black text-primary dark:text-dark-primary">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function MetricCards({ metrics }: { metrics: DashboardMetrics }) {
  const cards: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    hint: string;
    href: Href;
  }[] = [
    {
      label: "Tasks Due Today",
      value: String(metrics.tasksDueToday),
      icon: "calendar-clear-outline",
      hint: metrics._meta?.totalTasks
        ? `${metrics._meta.totalTasks} assigned overall`
        : "Assigned work due today",
      href: "/(main)/timeline?filter=today",
    },
    {
      label: "Active Projects",
      value: String(metrics.activeProjectsCount),
      icon: "folder-open-outline",
      hint: "Projects currently moving",
      href: "/(main)/projects",
    },
    {
      label: "Productivity Score",
      value: `${metrics.productivityPercentage}%`,
      icon: "trending-up-outline",
      hint:
        metrics._meta?.totalSubtasks != null &&
        metrics._meta.completedSubtasks != null
          ? `${metrics._meta.completedSubtasks} / ${metrics._meta.totalSubtasks} subtasks`
          : "Completed subtask progress",
      href: "/(main)/projects",
    },
  ];
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <View className="gap-3">
      {cards.map((card) => (
        <Pressable
          key={card.label}
          accessibilityRole="button"
          onPress={() => router.push(card.href)}
          className="flex-row items-center gap-4 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <View className="h-11 w-11 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
            <Ionicons name={card.icon} size={20} color={palette.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-extrabold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              {card.label}
            </Text>
            <Text className="mt-1 text-[28px] font-black text-accent dark:text-dark-accent">
              {card.value}
            </Text>
            <Text className="text-xs text-muted dark:text-dark-muted">
              {card.hint}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.subtle} />
        </Pressable>
      ))}
    </View>
  );
}

function UrgentTasks({ tasks }: { tasks: UrgentTask[] }) {
  if (tasks.length === 0) {
    return (
      <View className="items-center rounded-nova border border-glass bg-glass-card p-5 dark:border-dark-glass dark:bg-dark-glass-card">
        <Text className="text-center text-sm font-semibold text-muted dark:text-dark-muted">
          No open tasks with due dates.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {tasks.map((task) => {
        const dueLabel = task.dueLabel.toLowerCase();
        const isOverdue = dueLabel.includes("overdue");
        const isToday = dueLabel === "today";

        return (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            disabled={!taskHref(task.projectId, task.id)}
            onPress={() => {
              const href = taskHref(task.projectId, task.id);
              if (href) router.push(href);
            }}
            className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            <View className="flex-row items-start gap-3">
              <View
                className={`mt-1 h-2.5 w-2.5 rounded-full ${priorityColor(
                  task.priority,
                )}`}
              />
              <View className="flex-1">
                <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
                  {task.title}
                </Text>
                <View className="mt-2 flex-row flex-wrap items-center gap-2">
                  <Text className="rounded-full border border-glass bg-glass-button px-2.5 py-1 text-xs font-bold text-muted dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-muted">
                    {task.projectName}
                  </Text>
                  <Text
                    className={`text-xs font-black ${
                      isOverdue
                        ? "text-danger dark:text-dark-danger"
                        : isToday
                          ? "text-warning dark:text-dark-warning"
                          : "text-muted dark:text-dark-muted"
                    }`}
                  >
                    {task.dueLabel}
                  </Text>
                </View>
                <Text className="mt-2 text-xs text-subtle dark:text-dark-subtle">
                  Due {formatDate(task.dueDate)}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ContinueStrip({ data }: { data: DashboardContinue }) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const projectHref = data.lastProject
    ? (`/(main)/project/${data.lastProject.id}` as Href)
    : ("/(main)/projects" as Href);
  const boardHref = data.lastWhiteboard
    ? (`/(main)/whiteboard/${data.lastWhiteboard.id}` as Href)
    : ("/(main)/whiteboard" as Href);

  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(projectHref)}
        className="flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
      >
        <View className="h-10 w-10 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
          <Ionicons name="folder-open-outline" size={18} color={palette.accent} />
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
            Last project
          </Text>
          <Text className="mt-1 text-[15px] font-black text-primary dark:text-dark-primary">
            {data.lastProject?.name ?? "Open projects"}
          </Text>
          <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
            {data.lastProject
              ? `Updated ${formatDate(data.lastProject.updatedAt)}`
              : "No project yet"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.subtle} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(boardHref)}
        className="flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
      >
        <View className="h-10 w-10 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
          <Ionicons name="easel-outline" size={18} color={palette.accent} />
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
            Last whiteboard
          </Text>
          <Text className="mt-1 text-[15px] font-black text-primary dark:text-dark-primary">
            {data.lastWhiteboard?.title ?? "Open boards"}
          </Text>
          <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
            {data.lastWhiteboard
              ? `Edited ${formatDate(data.lastWhiteboard.lastEditedAt)}`
              : "No board yet"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.subtle} />
      </Pressable>

      <View className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
            <Ionicons name="calendar-outline" size={18} color={palette.accent} />
          </View>
          <Text className="text-[10px] font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
            Due today
          </Text>
        </View>
        {data.dueToday.length > 0 ? (
          <View className="mt-3 gap-2">
            {data.dueToday.map((task) => {
              const href = taskHref(task.projectId, task.id);
              return (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  disabled={!href}
                  onPress={() => {
                    if (href) router.push(href);
                  }}
                >
                  <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
                    {task.title}
                  </Text>
                  {task.projectName ? (
                    <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                      {task.projectName}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text className="mt-3 text-sm text-muted dark:text-dark-muted">
            Nothing due today
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(main)/timeline?filter=today" as Href)}
          className="mt-3"
        >
          <Text className="text-xs font-black text-accent dark:text-dark-accent">
            Today's timeline
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function recentActivityItems(activity: ActivityMap) {
  const items: (ActivityTaskEntry & { activityDate: string })[] = [];
  const dates = Object.keys(activity).sort((a, b) => b.localeCompare(a));
  for (const activityDate of dates) {
    const tasks = activity[activityDate];
    if (!tasks?.length) continue;
    for (const task of tasks) {
      items.push({ ...task, activityDate });
      if (items.length >= 3) return items;
    }
  }
  return items;
}

function RecentActivityList({
  items,
}: {
  items: (ActivityTaskEntry & { activityDate: string })[];
}) {
  if (!items.length) return null;

  return (
    <View className="mt-4 gap-3">
      {items.map((item) => {
        const href = taskHref(item.projectId, item.id);
        const body = (
          <>
            <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              {formatDate(item.activityDate)}
            </Text>
            <Text className="mt-2 font-extrabold text-primary dark:text-dark-primary">
              {item.title}
            </Text>
            <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
              {item.projectName} - {item.status}
            </Text>
          </>
        );
        if (!href) {
          return (
            <View
              key={`${item.activityDate}-${item.id}`}
              className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
            >
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={`${item.activityDate}-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push(href)}
            className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityMap>({});
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [continueData, setContinueData] = useState<DashboardContinue>({
    lastProject: null,
    lastWhiteboard: null,
    dueToday: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getDashboardSummaryApi();
      setMetrics(data.metrics);
      setActivity(data.activity);
      setUrgentTasks(data.urgentTasks);
      setContinueData(data.continue);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Failed to load dashboard",
        message: getApiErrorMessage(error, "Please try again later."),
      });
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  const recentItems = useMemo(() => recentActivityItems(activity), [activity]);
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <ScrollView
      className="flex-1 bg-main dark:bg-dark-main"
      contentContainerClassName="gap-5 p-5 pb-32"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View>
        <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
          Dashboard
        </Text>
        <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
          Your workspace overview for {dateStr}
        </Text>
        <Text className="mt-3 text-[16px] font-extrabold text-accent dark:text-dark-accent">
          Welcome, {user?.fullName ?? "Nova user"}
        </Text>
      </View>

      <ContinueStrip data={continueData} />

      <SectionCard icon="stats-chart-outline" title="Overview">
        {metrics ? <MetricCards metrics={metrics} /> : null}
      </SectionCard>

      <SectionCard icon="pulse-outline" title="Recent Activity">
        <ActivityHeatmap
          activity={activity}
          onOpenTask={(taskId, projectId) => {
            const href = taskHref(projectId, taskId);
            if (href) router.push(href);
          }}
        />
        <RecentActivityList items={recentItems} />
      </SectionCard>

      <SectionCard icon="alert-circle-outline" title="Urgent Tasks">
        <UrgentTasks tasks={urgentTasks} />
      </SectionCard>
    </ScrollView>
  );
}
