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
import { router, useLocalSearchParams } from "expo-router";
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
import { UserProfileLink } from "@/components/UserProfileLink";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

type StatusFilter = "All" | TaskStatus;

type AgendaGroup = {
  key: string;
  label: string;
  subtitle: string;
  tasks: TimelineTask[];
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

const statusPillClasses: Record<TaskStatus, string> = {
  "To Do":
    "border-glass bg-glass-button text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary",
  "In Progress":
    "border-warning/50 bg-warning/20 text-warning dark:border-dark-warning/50 dark:bg-dark-warning/20 dark:text-dark-warning",
  "In Review":
    "border-accent/50 bg-accent/20 text-accent dark:border-dark-accent/50 dark:bg-dark-accent/20 dark:text-dark-accent",
  Completed:
    "border-success/50 bg-success/20 text-success dark:border-dark-success/50 dark:bg-dark-success/20 dark:text-dark-success",
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

function startOfWeekMonday(value: Date) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
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
    const start = startOfWeekMonday(today);
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

function eachDay(start: Date, end: Date) {
  const days: Date[] = [];
  const cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function normalizeStatus(value: string): TaskStatus {
  if (value === "In Progress") return "In Progress";
  if (value === "In Review") return "In Review";
  if (value === "Completed" || value === "Done") return "Completed";
  return "To Do";
}

function formatShortDate(value?: string | Date | null) {
  const date = value instanceof Date ? value : parseDate(value);
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

function openTask(task: TimelineTask) {
  router.push({
    pathname: "/task/[id]",
    params: { id: task.id, projectId: task.project.id },
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
          ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
      }`}
    >
      <Text
        className={`text-xs font-black ${
          active ? "text-white" : "text-primary dark:text-dark-primary"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TaskCard({ task }: { task: TimelineTask }) {
  const status = normalizeStatus(task.status);
  const overdue = Boolean(task.overdue) && status !== "Completed";
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
          <View className="mt-3 flex-row flex-wrap gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button">
              <Ionicons name="calendar-outline" size={13} color="#c56010" />
              <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                Due {formatShortDate(task.dueDate)}
              </Text>
            </View>
            {overdue ? (
              <View className="rounded-full border border-danger/40 bg-danger/10 px-2.5 py-1 dark:border-dark-danger/40 dark:bg-dark-danger/10">
                <Text className="text-[11px] font-black text-danger dark:text-dark-danger">
                  Overdue
                </Text>
              </View>
            ) : null}
            {task.assignee ? (
              <UserProfileLink
                userId={task.assignee.id}
                className="flex-row items-center gap-1.5 rounded-full border border-glass bg-glass-button px-2.5 py-1 dark:border-dark-glass dark:bg-dark-glass-button"
              >
                <Ionicons name="person-outline" size={13} color="#c56010" />
                <Text className="text-[11px] font-bold text-muted dark:text-dark-muted">
                  {task.assignee.fullName}
                </Text>
              </UserProfileLink>
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
      subtitle="Choose which workspace should appear on the schedule."
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
            <Text className="font-black text-primary dark:text-dark-primary">
              {project.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomDrawer>
  );
}

const FILTER_VALUES = FILTER_OPTIONS.map((option) => option.value);

function parseTimelineFilter(value: unknown): TimelineFilter | null {
  if (typeof value !== "string") return null;
  return FILTER_VALUES.includes(value as TimelineFilter)
    ? (value as TimelineFilter)
    : null;
}

export default function TimelineScreen() {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const params = useLocalSearchParams<{ filter?: string | string[] }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<TimelineTask[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimelineFilter>(
    () =>
      parseTimelineFilter(
        Array.isArray(params.filter) ? params.filter[0] : params.filter,
      ) ?? "weekly",
  );
  const [projectId, setProjectId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
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
    const { start, end } = calendarWindow(timeFilter);
    const byDay = new Map<string, TimelineTask[]>();
    for (const task of filteredItems) {
      const due = parseDay(task.dueDate);
      if (!due) continue;
      const key = dateKey(due);
      const existing = byDay.get(key);
      if (existing) existing.push(task);
      else byDay.set(key, [task]);
    }
    for (const dayTasks of byDay.values()) {
      dayTasks.sort((a, b) => {
        const aTime = parseDate(a.dueDate)?.getTime() ?? 0;
        const bTime = parseDate(b.dueDate)?.getTime() ?? 0;
        return aTime - bTime;
      });
    }

    const days =
      timeFilter === "weekly" ? eachDay(start, end) : Array.from(byDay.keys()).map((key) => {
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d);
      });

    return days.map((day) => {
      const key = dateKey(day);
      return {
        key,
        label: formatLongDate(day),
        subtitle: day.toLocaleDateString(undefined, { year: "numeric" }),
        tasks: byDay.get(key) ?? [],
      } satisfies AgendaGroup;
    });
  }, [filteredItems, timeFilter]);

  const windowLabel =
    items[0]?.windowLabel ??
    FILTER_OPTIONS.find((option) => option.value === timeFilter)?.label ??
    "Schedule";

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-5 pb-32"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[28px] font-black text-primary dark:text-dark-primary">
                Schedule
              </Text>
              <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
                {windowLabel} · {filteredItems.length} task
                {filteredItems.length === 1 ? "" : "s"}
              </Text>
            </View>
            {refreshing ? (
              <ActivityIndicator color={palette.accent} />
            ) : (
              <View className="h-11 w-11 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                <Ionicons name="list-outline" size={20} color={palette.accent} />
              </View>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
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

          <Pressable
            accessibilityRole="button"
            onPress={() => setProjectDrawerOpen(true)}
            className="mt-3 min-h-[46px] flex-row items-center justify-between rounded-nova border border-glass bg-glass-button px-3 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Text
              numberOfLines={1}
              className="flex-1 font-black text-primary dark:text-dark-primary"
            >
              {selectedProject?.title ?? "All projects"}
            </Text>
            <Ionicons name="chevron-down-outline" size={18} color={palette.accent} />
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
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

        {agendaGroups.length === 0 ||
        agendaGroups.every((group) => group.tasks.length === 0) ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Ionicons name="calendar-clear-outline" size={32} color={palette.accent} />
            <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
              Nothing due
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              No tasks in {windowLabel.toLowerCase()}.
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
                  {group.tasks.length}
                </Text>
              </View>
              {group.tasks.length === 0 ? (
                <View className="rounded-nova border border-dashed border-glass px-4 py-3 dark:border-dark-glass">
                  <Text className="text-sm font-bold text-muted dark:text-dark-muted">
                    No tasks
                  </Text>
                </View>
              ) : (
                group.tasks.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </View>
          ))
        )}
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
