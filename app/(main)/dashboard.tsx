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
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  getDashboardActivityApi,
  getDashboardMetricsApi,
  getDashboardUrgentTasksApi,
  type ActivityMap,
  type ActivityTaskEntry,
  type DashboardMetrics,
  type UrgentTask,
} from "@/api/dashboard";
import { PageSkeleton, SkeletonLine } from "@/components/Skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"] as const;

type HeatmapTask = {
  title: string;
  project: string;
  progress: number;
};

type HeatmapCell = {
  key: string;
  date: Date;
  isCurrentYear: boolean;
  count: number;
  tasks: HeatmapTask[];
};

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildHeatmap(activity: ActivityMap) {
  const year = new Date().getFullYear();
  const taskMap = new Map<string, HeatmapTask[]>();

  for (const [isoKey, entries] of Object.entries(activity)) {
    if (!entries?.length) continue;
    const date = new Date(isoKey);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;
    taskMap.set(
      isoKey,
      entries.map((task) => ({
        title: task.title,
        project: task.projectName,
        progress: Math.round(task.completionPercentage ?? 0),
      })),
    );
  }

  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay();
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - (startDay === 0 ? 6 : startDay - 1));

  const dec31 = new Date(year, 11, 31);
  const endDay = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(gridEnd.getDate() + (endDay === 0 ? 0 : 7 - endDay));

  const weeks: HeatmapCell[][] = [];
  const monthCols: { label: string; col: number }[] = [];
  const seenMonths = new Set<number>();
  const cursor = new Date(gridStart);
  let col = 0;

  while (cursor <= gridEnd) {
    const week: HeatmapCell[] = [];
    for (let row = 0; row < 7; row++) {
      const date = new Date(cursor);
      date.setDate(date.getDate() + row);
      const isCurrentYear = date.getFullYear() === year;
      const key = toDateKey(date);
      const tasks = taskMap.get(key) ?? [];

      if (isCurrentYear && row === 0 && !seenMonths.has(date.getMonth())) {
        seenMonths.add(date.getMonth());
        monthCols.push({ label: monthNames[date.getMonth()], col });
      }

      week.push({ key, date, isCurrentYear, count: tasks.length, tasks });
    }
    weeks.push(week);
    col++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return { weeks, monthCols, year };
}

function heatmapOpacity(count: number) {
  if (count === 0) return 0.08;
  if (count === 1) return 0.28;
  if (count === 2) return 0.52;
  if (count === 3) return 0.76;
  return 1;
}

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

function MetricsSkeleton() {
  return (
    <View className="gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <SkeletonLine className="w-2/5" />
          <SkeletonLine className="mt-3 h-8 w-1/4" />
          <SkeletonLine className="mt-2 w-1/2" />
        </View>
      ))}
    </View>
  );
}

function ActivitySkeleton() {
  return (
    <View>
      <SkeletonLine className="mb-4 w-3/5" />
      <View className="flex-row gap-[3px]">
        {Array.from({ length: 22 }).map((_, week) => (
          <View key={week} className="gap-[3px]">
            {Array.from({ length: 7 }).map((__, day) => (
              <View
                key={`${week}-${day}`}
                className="h-[10px] w-[10px] rounded-[3px] bg-glass-button dark:bg-dark-glass-button"
              />
            ))}
          </View>
        ))}
      </View>
      <SkeletonLine className="mt-5 h-16 w-full" />
    </View>
  );
}

function UrgentSkeleton() {
  return (
    <View className="gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="mt-3 w-1/2" />
        </View>
      ))}
    </View>
  );
}

function MetricCards({ metrics }: { metrics: DashboardMetrics }) {
  const cards = [
    {
      label: "Tasks Due Today",
      value: String(metrics.tasksDueToday),
      icon: "calendar-clear-outline" as const,
      hint: metrics._meta?.totalAssignedTasks
        ? `${metrics._meta.totalAssignedTasks} assigned overall`
        : "Assigned work due today",
    },
    {
      label: "Active Projects",
      value: String(metrics.activeProjectsCount),
      icon: "folder-open-outline" as const,
      hint: "Projects currently moving",
    },
    {
      label: "Productivity Score",
      value: `${metrics.productivityPercentage}%`,
      icon: "trending-up-outline" as const,
      hint:
        metrics._meta?.totalSubtasks != null &&
        metrics._meta.completedSubtasks != null
          ? `${metrics._meta.completedSubtasks} / ${metrics._meta.totalSubtasks} subtasks`
          : "Completed subtask progress",
    },
  ];
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <View className="gap-3">
      {cards.map((card) => (
        <View
          key={card.label}
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
        </View>
      ))}
    </View>
  );
}

function ActivityHeatmap({ activity }: { activity: ActivityMap }) {
  const { weeks, monthCols, year } = useMemo(
    () => buildHeatmap(activity),
    [activity],
  );
  const firstActiveCell = useMemo(
    () =>
      weeks
        .flat()
        .filter((cell) => cell.isCurrentYear && cell.tasks.length > 0)
        .sort((a, b) => b.key.localeCompare(a.key))[0] ?? null,
    [weeks],
  );
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const activeCell = selected ?? firstActiveCell;
  const totalTasks = useMemo(
    () => weeks.flat().reduce((total, cell) => total + cell.tasks.length, 0),
    [weeks],
  );

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-subtle dark:text-dark-subtle">
          {totalTasks} task{totalTasks === 1 ? "" : "s"} scheduled in {year}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[10px] text-subtle dark:text-dark-subtle">
            Less
          </Text>
          {[0.08, 0.28, 0.52, 0.76, 1].map((opacity) => (
            <View
              key={opacity}
              className="h-[10px] w-[10px] rounded-[3px] bg-accent dark:bg-dark-accent"
              style={{ opacity }}
            />
          ))}
          <Text className="text-[10px] text-subtle dark:text-dark-subtle">
            More
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="pb-1"
      >
        <View>
          <View className="relative mb-1 ml-8 h-[16px]">
            {monthCols.map(({ label, col }) => (
              <Text
                key={`${label}-${col}`}
                className="absolute text-[10px] text-subtle dark:text-dark-subtle"
                style={{ left: col * 13 }}
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row gap-1.5">
            <View className="w-6 gap-[3px]">
              {dayLabels.map((label, index) => (
                <View
                  key={`${label}-${index}`}
                  className="h-[10px] justify-center"
                >
                  <Text className="text-[9px] text-subtle dark:text-dark-subtle">
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row gap-[3px]">
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} className="gap-[3px]">
                  {week.map((cell) => {
                    const selectedCell = activeCell?.key === cell.key;
                    return (
                      <Pressable
                        key={cell.key}
                        accessibilityRole="button"
                        accessibilityLabel={cell.isCurrentYear ? cell.key : undefined}
                        disabled={!cell.isCurrentYear}
                        onPress={() => setSelected(cell)}
                        className={`h-6 w-6 rounded-md bg-accent dark:bg-dark-accent ${
                          selectedCell
                            ? "border border-primary dark:border-dark-primary"
                            : ""
                        }`}
                        style={{
                          opacity: cell.isCurrentYear
                            ? heatmapOpacity(cell.count)
                            : 0,
                        }}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="mt-4 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
        <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
          {activeCell
            ? activeCell.date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : "No activity"}
        </Text>

        {activeCell?.tasks.length ? (
          <View className="mt-3 gap-3">
            {activeCell.tasks.map((task, index) => (
              <View key={`${task.title}-${index}`}>
                <Text className="font-extrabold text-primary dark:text-dark-primary">
                  {task.title}
                </Text>
                <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                  {task.project}
                </Text>
                <View className="mt-2 flex-row items-center gap-2">
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
                    <View
                      className="h-full rounded-full bg-accent dark:bg-dark-accent"
                      style={{
                        width: `${Math.max(0, Math.min(100, task.progress))}%`,
                      }}
                    />
                  </View>
                  <Text className="text-xs font-black text-accent dark:text-dark-accent">
                    {task.progress}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-2 text-sm text-muted dark:text-dark-muted">
            No activity for this day.
          </Text>
        )}
      </View>
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
          <View
            key={task.id}
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
          </View>
        );
      })}
    </View>
  );
}

function recentActivityItems(activity: ActivityMap) {
  return Object.entries(activity)
    .flatMap(([activityDate, tasks]) =>
      tasks.map((task) => ({ ...task, activityDate })),
    )
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate))
    .slice(0, 3);
}

function RecentActivityList({
  items,
}: {
  items: (ActivityTaskEntry & { activityDate: string })[];
}) {
  if (!items.length) return null;

  return (
    <View className="mt-4 gap-3">
      {items.map((item) => (
        <View
          key={`${item.activityDate}-${item.id}`}
          className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
            {formatDate(item.activityDate)}
          </Text>
          <Text className="mt-2 font-extrabold text-primary dark:text-dark-primary">
            {item.title}
          </Text>
          <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
            {item.projectName} - {item.status}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityMap>({});
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [urgentLoading, setUrgentLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getDashboardMetricsApi();
      setMetrics(data);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Failed to load metrics",
        message: getApiErrorMessage(error, "Please try again later."),
      });
    } finally {
      setMetricsLoading(false);
    }
  }, [showSnackbar]);

  const loadActivity = useCallback(async () => {
    try {
      const data = await getDashboardActivityApi();
      setActivity(data);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Failed to load activity",
        message: getApiErrorMessage(error, "Please try again later."),
      });
    } finally {
      setActivityLoading(false);
    }
  }, [showSnackbar]);

  const loadUrgentTasks = useCallback(async () => {
    try {
      const data = await getDashboardUrgentTasksApi();
      setUrgentTasks(data);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Failed to load urgent tasks",
        message: getApiErrorMessage(error, "Please try again later."),
      });
    } finally {
      setUrgentLoading(false);
    }
  }, [showSnackbar]);

  const loadDashboard = useCallback(async () => {
    await Promise.all([loadMetrics(), loadActivity(), loadUrgentTasks()]);
  }, [loadActivity, loadMetrics, loadUrgentTasks]);

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

  if (metricsLoading && activityLoading && urgentLoading) {
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

      <SectionCard icon="stats-chart-outline" title="Overview">
        {metricsLoading ? (
          <MetricsSkeleton />
        ) : metrics ? (
          <MetricCards metrics={metrics} />
        ) : null}
      </SectionCard>

      <SectionCard icon="pulse-outline" title="Recent Activity">
        {activityLoading ? (
          <ActivitySkeleton />
        ) : (
          <>
            <ActivityHeatmap activity={activity} />
            <RecentActivityList items={recentItems} />
          </>
        )}
      </SectionCard>

      <SectionCard icon="alert-circle-outline" title="Urgent Tasks">
        {urgentLoading ? <UrgentSkeleton /> : <UrgentTasks tasks={urgentTasks} />}
      </SectionCard>
    </ScrollView>
  );
}
