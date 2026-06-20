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
import { getApiErrorMessage } from "@/api/apiClient";
import {
  listProjectsApi,
  sortProjectsByStatus,
  type Project,
} from "@/api/projects";
import {
  getTimelineApi,
  type TimelineFilter,
  type TimelineTask,
} from "@/api/timeline";
import type { TaskStatus } from "@/api/tasks";
import { BottomDrawer } from "@/components/BottomDrawer";
import { PageSkeleton } from "@/components/Skeleton";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

type StatusFilter = "All" | TaskStatus;

type AgendaGroup = {
  key: string;
  label: string;
  subtitle: string;
  tasks: TimelineTask[];
};

type TimelineSpan = TimelineTask & {
  left: number;
  width: number;
  row: number;
};

const FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
  { value: "yearly", label: "Year" },
];

const STATUS_OPTIONS: StatusFilter[] = [
  "All",
  "To Do",
  "In Progress",
  "In Review",
  "Completed",
];

const DAY_WIDTH: Record<TimelineFilter, number> = {
  today: 220,
  tomorrow: 220,
  weekly: 86,
  monthly: 34,
  yearly: 9,
};

const statusPillClasses: Record<TaskStatus, string> = {
  "To Do": "border-glass bg-glass-button text-muted dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-muted",
  "In Progress": "border-warning/50 bg-warning/10 text-warning dark:border-dark-warning/50 dark:bg-dark-warning/10 dark:text-dark-warning",
  "In Review": "border-accent/50 bg-accent/10 text-accent dark:border-dark-accent/50 dark:bg-dark-accent/10 dark:text-dark-accent",
  Completed: "border-success/50 bg-success/10 text-success dark:border-dark-success/50 dark:bg-dark-success/10 dark:text-dark-success",
};

const statusAccentClasses: Record<TaskStatus, string> = {
  "To Do": "bg-muted dark:bg-dark-muted",
  "In Progress": "bg-warning dark:bg-dark-warning",
  "In Review": "bg-accent dark:bg-dark-accent",
  Completed: "bg-success dark:bg-dark-success",
};

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDay(value?: string | null) {
  const date = parseDate(value);
  return date ? startOfDay(date) : null;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayOffset(date: Date, origin: Date) {
  return Math.round((startOfDay(date).getTime() - origin.getTime()) / 86_400_000);
}

function previousSaturday(value: Date) {
  const date = startOfDay(value);
  const diff = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

function calendarWindow(filter: TimelineFilter) {
  const today = startOfDay(new Date());
  if (filter === "today") return { start: today, end: endOfDay(today) };
  if (filter === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: tomorrow, end: endOfDay(tomorrow) };
  }
  if (filter === "weekly") {
    const start = previousSaturday(today);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end: endOfDay(end) };
  }
  if (filter === "yearly") {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    return { start, end: endOfDay(end) };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start, end: endOfDay(end) };
}

function normalizeStatus(value: string): TaskStatus {
  if (value === "In Progress") return "In Progress";
  if (value === "In Review") return "In Review";
  if (value === "Completed" || value === "Done") return "Completed";
  return "To Do";
}

function formatShortDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTaskRange(task: TimelineTask) {
  return `${formatShortDate(task.startDate)} - ${formatShortDate(task.dueDate)}`;
}

function statusCount(items: TimelineTask[], status: TaskStatus) {
  return items.filter((item) => normalizeStatus(item.status) === status).length;
}

function openTask(task: TimelineTask) {
  router.push({
    pathname: "/task/[id]",
    params: { id: task.id, projectId: task.project.id },
  });
}

function assignRows(spans: Omit<TimelineSpan, "row">[]) {
  const rowEnds: number[] = [];
  return [...spans]
    .sort((a, b) => a.left - b.left)
    .map((span) => {
      const right = span.left + span.width;
      let row = rowEnds.findIndex((end) => end + 8 <= span.left);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(right);
      } else {
        rowEnds[row] = right;
      }
      return { ...span, row };
    });
}

function FilterChip<T extends string>({
  label,
  active,
  onPress,
}: {
  label: T;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full border px-3 py-2 active:opacity-75 ${
        active
          ? "border-accent bg-accent/20 dark:border-dark-accent dark:bg-dark-accent/20"
          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
      }`}
    >
      <Text
        className={`text-xs font-black ${
          active
            ? "text-accent dark:text-dark-accent"
            : "text-primary dark:text-dark-primary"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  return (
    <View className="flex-1 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
      <Ionicons name={icon} size={18} color={palette.accent} />
      <Text className="mt-2 text-[20px] font-black text-primary dark:text-dark-primary">
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] font-bold text-muted dark:text-dark-muted">
        {label}
      </Text>
    </View>
  );
}

function TaskCard({ task }: { task: TimelineTask }) {
  const status = normalizeStatus(task.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={() => openTask(task)}
      className="rounded-nova border border-glass bg-glass-card p-4 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-card"
    >
      <View className="flex-row items-start gap-3">
        <View className={`mt-1 h-3 w-3 rounded-full ${statusAccentClasses[status]}`} />
        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
                {task.title}
              </Text>
              <Text className="mt-1 text-xs font-bold text-muted dark:text-dark-muted">
                {task.project.name}
              </Text>
            </View>
            <Text
              className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusPillClasses[status]}`}
            >
              {status}
            </Text>
          </View>

          {task.description ? (
            <Text
              numberOfLines={2}
              className="mt-3 text-sm leading-5 text-muted dark:text-dark-muted"
            >
              {task.description}
            </Text>
          ) : null}

          <View className="mt-4 flex-row flex-wrap gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button">
              <Ionicons name="calendar-outline" size={13} color="#c56010" />
              <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                {formatShortDate(task.startDate)} - {formatShortDate(task.dueDate)}
              </Text>
            </View>
            {task.assignee ? (
              <View className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button">
                <Ionicons name="person-outline" size={13} color="#c56010" />
                <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                  {task.assignee.fullName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ProjectPickerDrawer({
  visible,
  projects,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  projects: Project[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomDrawer
      visible={visible}
      title="Filter Project"
      subtitle="Choose which workspace should appear on the timeline."
      onClose={onClose}
    >
      <View className="gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onSelect("all");
            onClose();
          }}
          className={`rounded-nova border p-4 active:opacity-75 ${
            selectedId === "all"
              ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
              : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
          }`}
        >
          <Text className="font-black text-primary dark:text-dark-primary">
            All projects
          </Text>
          <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
            Show every scheduled task you can access.
          </Text>
        </Pressable>

        {projects.map((project) => (
          <Pressable
            key={project.id}
            accessibilityRole="button"
            onPress={() => {
              onSelect(project.id);
              onClose();
            }}
            className={`rounded-nova border p-4 active:opacity-75 ${
              selectedId === project.id
                ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
            }`}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="font-black text-primary dark:text-dark-primary">
                  {project.title}
                </Text>
                <Text
                  numberOfLines={2}
                  className="mt-1 text-xs leading-4 text-muted dark:text-dark-muted"
                >
                  {project.description || "No description"}
                </Text>
              </View>
              <Text className="text-xs font-black text-accent dark:text-dark-accent">
                {project.progress}%
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </BottomDrawer>
  );
}

export default function TimelineScreen() {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<TimelineTask[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimelineFilter>("weekly");
  const [projectId, setProjectId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [selectedScheduleTaskId, setSelectedScheduleTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  );

  const load = useCallback(async () => {
    try {
      const [projectData, timelineData] = await Promise.all([
        listProjectsApi(),
        getTimelineApi({
          filter: timeFilter,
          ...(projectId !== "all" ? { projectId } : {}),
        }),
      ]);
      setProjects(sortProjectsByStatus(projectData));
      setItems(timelineData);
    } catch (error) {
      setItems([]);
      showSnackbar({
        variant: "error",
        title: "Could not load timeline",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, showSnackbar, timeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "All") return items;
    return items.filter((item) => normalizeStatus(item.status) === statusFilter);
  }, [items, statusFilter]);

  const agendaGroups = useMemo(() => {
    const grouped = new Map<string, AgendaGroup>();
    filteredItems
      .slice()
      .sort((a, b) => {
        const aTime = parseDate(a.dueDate)?.getTime() ?? 0;
        const bTime = parseDate(b.dueDate)?.getTime() ?? 0;
        return aTime - bTime;
      })
      .forEach((task) => {
        const due = parseDay(task.dueDate) ?? new Date(0);
        const key = dateKey(due);
        const existing = grouped.get(key);
        if (existing) {
          existing.tasks.push(task);
          return;
        }
        grouped.set(key, {
          key,
          label: formatLongDate(due),
          subtitle: due.toLocaleDateString(undefined, { year: "numeric" }),
          tasks: [task],
        });
      });
    return Array.from(grouped.values());
  }, [filteredItems]);

  const schedule = useMemo(() => {
    const { start, end } = calendarWindow(timeFilter);
    const totalDays = Math.max(1, dayOffset(end, start) + 1);
    const dayWidth = DAY_WIDTH[timeFilter];
    const width = totalDays * dayWidth;
    const todayOffset = dayOffset(new Date(), start);
    const todayLeft =
      todayOffset >= 0 && todayOffset < totalDays
        ? todayOffset * dayWidth + dayWidth / 2
        : null;

    const ticks = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      const shouldShow =
        timeFilter === "yearly"
          ? date.getDate() === 1
          : timeFilter === "monthly"
            ? index % 3 === 0
            : true;
      return {
        key: date.toISOString(),
        left: index * dayWidth,
        width: dayWidth,
        label: shouldShow
          ? date.toLocaleDateString(undefined, {
              month: timeFilter === "yearly" ? "short" : undefined,
              weekday: timeFilter === "weekly" ? "short" : undefined,
              day: timeFilter === "yearly" ? undefined : "numeric",
            })
          : "",
      };
    });

    const rawSpans = filteredItems
      .map((task) => {
        const startDate = parseDay(task.startDate);
        const dueDate = parseDay(task.dueDate);
        if (!startDate || !dueDate) return null;
        const [taskStart, taskEnd] =
          startDate <= dueDate ? [startDate, dueDate] : [dueDate, startDate];
        if (taskEnd < start || taskStart > end) return null;
        const visibleStart = taskStart < start ? start : taskStart;
        const visibleEnd = taskEnd > end ? end : taskEnd;
        const left = dayOffset(visibleStart, start) * dayWidth;
        const right = (dayOffset(visibleEnd, start) + 1) * dayWidth;
        return {
          ...task,
          left,
          width: Math.max(right - left, 72),
        };
      })
      .filter((task): task is Omit<TimelineSpan, "row"> => Boolean(task));

    const spans = assignRows(rawSpans);
    const rows = Math.max(
      1,
      spans.reduce((max, item) => Math.max(max, item.row + 1), 0),
    );

    return { width, ticks, todayLeft, spans, rows };
  }, [filteredItems, timeFilter]);

  const windowLabel =
    items[0]?.windowLabel ??
    FILTER_OPTIONS.find((option) => option.value === timeFilter)?.label ??
    "Timeline";

  const completedCount = statusCount(filteredItems, "Completed");
  const activeCount = filteredItems.length - completedCount;
  const selectedScheduleTask = useMemo(
    () =>
      schedule.spans.find((task) => task.id === selectedScheduleTaskId) ??
      schedule.spans[0] ??
      null,
    [schedule.spans, selectedScheduleTaskId],
  );

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-32"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
                Timeline
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                Plan and review scheduled work across {windowLabel.toLowerCase()}.
              </Text>
            </View>
            {refreshing ? (
              <ActivityIndicator color={palette.accent} />
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                <Ionicons name="git-compare-outline" size={23} color={palette.accent} />
              </View>
            )}
          </View>

          <View className="mt-5 flex-row gap-3">
            <StatCard label="Scheduled" value={filteredItems.length} icon="calendar-outline" />
            <StatCard label="Active" value={activeCount} icon="flash-outline" />
            <StatCard label="Done" value={completedCount} icon="checkmark-done-outline" />
          </View>
        </View>

        <View className="gap-3 rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
            Range
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {FILTER_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  active={timeFilter === option.value}
                  onPress={() => setTimeFilter(option.value)}
                />
              ))}
            </View>
          </ScrollView>

          <View className="h-px bg-glass dark:bg-dark-glass" />

          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={() => setProjectDrawerOpen(true)}
              className="min-h-[48px] flex-1 flex-row items-center justify-between gap-3 rounded-nova border border-glass bg-glass-button px-3 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <View className="flex-1">
                <Text className="text-[11px] font-black uppercase tracking-[1px] text-muted dark:text-dark-muted">
                  Project
                </Text>
                <Text
                  numberOfLines={1}
                  className="mt-0.5 font-black text-primary dark:text-dark-primary"
                >
                  {selectedProject?.title ?? "All projects"}
                </Text>
              </View>
              <Ionicons name="chevron-down-outline" size={18} color={palette.accent} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {STATUS_OPTIONS.map((status) => (
                <FilterChip
                  key={status}
                  label={status}
                  active={statusFilter === status}
                  onPress={() => setStatusFilter(status)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
                Schedule
              </Text>
              <Text className="mt-0.5 text-xs font-bold text-muted dark:text-dark-muted">
                Tap a capsule to preview, then open the task when ready.
              </Text>
            </View>
            <View className="h-10 w-10 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
              <Ionicons name="pulse-outline" size={20} color={palette.accent} />
            </View>
          </View>

          {schedule.spans.length === 0 ? (
            <View className="items-center rounded-nova border border-glass bg-glass-card py-10 dark:border-dark-glass dark:bg-dark-glass-card">
              <Ionicons name="calendar-clear-outline" size={32} color={palette.accent} />
              <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
                Nothing scheduled
              </Text>
              <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
                Try another range, project, or status.
              </Text>
            </View>
          ) : (
            <View>
              <View className="mb-3 flex-row flex-wrap gap-2">
                {STATUS_OPTIONS.filter((status): status is TaskStatus => status !== "All").map(
                  (status) => (
                    <View
                      key={status}
                      className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button"
                    >
                      <View className={`h-2 w-2 rounded-full ${statusAccentClasses[status]}`} />
                      <Text className="text-[10px] font-black text-muted dark:text-dark-muted">
                        {status}
                      </Text>
                    </View>
                  ),
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="pr-4"
              >
                <View
                  className="overflow-hidden rounded-nova-xl border border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
                  style={{ width: Math.max(schedule.width, 320) }}
                >
                  <View className="h-[62px] border-b border-glass bg-glass-button/70 dark:border-dark-glass dark:bg-dark-glass-button/70">
                    {schedule.ticks.map((tick) => (
                      <View
                        key={tick.key}
                        className="absolute top-0 h-full items-center justify-center border-r border-glass/60 px-1 dark:border-dark-glass"
                        style={{ left: tick.left, width: tick.width }}
                      >
                        <Text
                          numberOfLines={1}
                          className="mb-1 text-[10px] font-black uppercase text-muted dark:text-dark-muted"
                        >
                          {tick.label}
                        </Text>
                        <View className="h-1.5 w-1.5 rounded-full bg-muted/40 dark:bg-dark-muted/40" />
                      </View>
                    ))}

                    {schedule.todayLeft !== null ? (
                      <View
                        className="absolute top-3 items-center"
                        style={{ left: schedule.todayLeft - 22, width: 44 }}
                      >
                        <Text className="rounded-full bg-accent px-2 py-1 text-[8px] font-black uppercase text-white dark:bg-dark-accent">
                          Today
                        </Text>
                        <View className="mt-1 h-8 w-[2px] bg-accent dark:bg-dark-accent" />
                      </View>
                    ) : null}
                  </View>

                  <View
                    className="bg-sidebar/40 dark:bg-dark-sidebar/40"
                    style={{ height: schedule.rows * 66 + 24 }}
                  >
                    {Array.from({ length: schedule.rows }).map((_, row) => (
                      <View
                        key={row}
                        className="absolute left-3 right-3 flex-row items-center rounded-nova border border-glass/60 bg-glass-button/45 dark:border-dark-glass dark:bg-dark-glass-button/45"
                        style={{ top: row * 66 + 12, height: 48 }}
                      >
                        <Text className="ml-3 text-[10px] font-black uppercase text-muted/60 dark:text-dark-muted/60">
                          {String(row + 1).padStart(2, "0")}
                        </Text>
                      </View>
                    ))}

                    {schedule.todayLeft !== null ? (
                      <View
                        className="absolute top-0 h-full w-[2px] bg-accent/25 dark:bg-dark-accent/25"
                        style={{ left: schedule.todayLeft }}
                      />
                    ) : null}

                    {schedule.spans.map((task) => {
                      const status = normalizeStatus(task.status);
                      const active = selectedScheduleTask?.id === task.id;
                      return (
                        <Pressable
                          key={task.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Preview ${task.title}`}
                          onPress={() => setSelectedScheduleTaskId(task.id)}
                          className={`absolute h-12 justify-center rounded-nova border px-3 active:opacity-75 ${statusPillClasses[status]} ${
                            active
                              ? "border-accent bg-accent/20 dark:border-dark-accent dark:bg-dark-accent/20"
                              : "bg-glass-card dark:bg-dark-glass-card"
                          }`}
                          style={{
                            left: task.left + 8,
                            top: task.row * 66 + 12,
                            width: Math.max(task.width - 16, 116),
                          }}
                        >
                          <View className="flex-row items-center gap-2.5">
                            <View
                              className={`h-8 w-1.5 rounded-full ${statusAccentClasses[status]}`}
                            />
                            <View className="flex-1">
                              <Text
                                numberOfLines={1}
                                className="text-[12px] font-black text-primary dark:text-dark-primary"
                              >
                                {task.title}
                              </Text>
                              <Text
                                numberOfLines={1}
                                className="mt-0.5 text-[10px] font-bold text-muted dark:text-dark-muted"
                              >
                                {task.project.name}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              {selectedScheduleTask ? (
                <View className="mt-4 rounded-nova-xl border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
                  <View className="flex-row items-start gap-3">
                    <View
                      className={`h-12 w-2 rounded-full ${statusAccentClasses[normalizeStatus(selectedScheduleTask.status)]}`}
                    />
                    <View className="h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                      <Ionicons name="calendar-number-outline" size={22} color={palette.accent} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text
                            numberOfLines={2}
                            className="text-[17px] font-black text-primary dark:text-dark-primary"
                          >
                            {selectedScheduleTask.title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="mt-1 text-xs font-bold text-muted dark:text-dark-muted"
                          >
                            {selectedScheduleTask.project.name}
                          </Text>
                        </View>
                        <Text
                          className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusPillClasses[normalizeStatus(selectedScheduleTask.status)]}`}
                        >
                          {normalizeStatus(selectedScheduleTask.status)}
                        </Text>
                      </View>

                      <View className="mt-4 flex-row flex-wrap gap-2">
                        <View className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button">
                          <Ionicons name="calendar-outline" size={13} color={palette.accent} />
                          <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                            {formatTaskRange(selectedScheduleTask)}
                          </Text>
                        </View>
                        {selectedScheduleTask.assignee ? (
                          <View className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button">
                            <Ionicons name="person-outline" size={13} color={palette.accent} />
                            <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                              {selectedScheduleTask.assignee.fullName}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openTask(selectedScheduleTask)}
                        className="mt-4 min-h-[44px] flex-row items-center justify-center gap-2 rounded-nova bg-accent px-4 active:opacity-80 dark:bg-dark-accent"
                      >
                        <Text className="text-sm font-black text-white">Open details</Text>
                        <Ionicons name="arrow-forward-outline" size={17} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View className="gap-4">
          <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
            Agenda
          </Text>

          {agendaGroups.length === 0 ? (
            <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
              <Ionicons name="file-tray-outline" size={32} color={palette.accent} />
              <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
                No matching tasks
              </Text>
              <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
                Adjust your filters to see more scheduled work.
              </Text>
            </View>
          ) : (
            agendaGroups.map((group) => (
              <View key={group.key} className="gap-3">
                <View className="flex-row items-end justify-between">
                  <View>
                    <Text className="text-[17px] font-black text-primary dark:text-dark-primary">
                      {group.label}
                    </Text>
                    <Text className="text-xs font-bold text-muted dark:text-dark-muted">
                      {group.subtitle}
                    </Text>
                  </View>
                  <Text className="text-xs font-black text-accent dark:text-dark-accent">
                    {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                  </Text>
                </View>
                {group.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <ProjectPickerDrawer
        visible={projectDrawerOpen}
        projects={projects}
        selectedId={projectId}
        onSelect={setProjectId}
        onClose={() => setProjectDrawerOpen(false)}
      />
    </View>
  );
}
