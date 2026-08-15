"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { CalendarDays, FolderKanban, PenLine } from "lucide-react";
import {
  ActivityHeatmapSkeleton,
  ContinueStripSkeleton,
  MetricsCardsSkeleton,
  UrgentTasksTableSkeleton,
} from "@/components/skeletons/DashboardSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { GlassCard } from "@/components/ui/GlassCard";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/ui/Toast";
import { useTaskDrawerContext } from "@/lib/useTaskDrawerContext";
import {
  getDashboardActivityApi,
  getDashboardContinueApi,
  getDashboardMetricsApi,
  getDashboardUrgentTasksApi,
  type ActivityMap,
  type DashboardContinue,
  type DashboardMetrics,
  type UrgentTask,
} from "@/lib/api/dashboard";
import { getTaskApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/tasks";

type OpenTaskHandler = (taskId: string, projectId: string) => void;

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatRelativeStamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type HeatmapTask = {
  id: string;
  title: string;
  project: string;
  projectId: string | null;
  progress: number;
};

type CellData = {
  date: Date;
  isCurrentYear: boolean;
  count: number;
  tasks: HeatmapTask[];
};

type TooltipState = { cell: CellData; rect: DOMRect } | null;

// ─── Heatmap builder ──────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function buildHeatmap(activity: ActivityMap) {
  const year = new Date().getFullYear();

  const taskMap = new Map<string, HeatmapTask[]>();
  for (const [isoKey, entries] of Object.entries(activity)) {
    if (!entries?.length) continue;
    const d = new Date(isoKey);
    if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    taskMap.set(
      isoKey,
      entries.map((t) => ({
        id: t.id,
        title: t.title,
        project: t.projectName,
        projectId: t.projectId ?? null,
        progress: Math.round(t.completionPercentage),
      })),
    );
  }

  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - back);

  const dec31 = new Date(year, 11, 31);
  const dec31dow = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(gridEnd.getDate() + (dec31dow === 0 ? 0 : 7 - dec31dow));

  const weeks: CellData[][] = [];
  const monthCols: { label: string; col: number }[] = [];
  const seenMonths = new Set<number>();
  const cursor = new Date(gridStart);
  let col = 0;

  while (cursor <= gridEnd) {
    const week: CellData[] = [];
    for (let row = 0; row < 7; row++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + row);
      const isCurrentYear = d.getFullYear() === year;
      const key = toDateKey(d);
      const realTasks = taskMap.get(key) ?? [];
      const count = realTasks.length;

      if (isCurrentYear && row === 0 && !seenMonths.has(d.getMonth())) {
        seenMonths.add(d.getMonth());
        monthCols.push({ label: MONTH_NAMES[d.getMonth()], col });
      }

      week.push({ date: new Date(d), isCurrentYear, count, tasks: realTasks });
    }
    weeks.push(week);
    col++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return { weeks, monthCols };
}

function HeatmapTaskRow({
  task,
  onOpenTask,
}: {
  task: HeatmapTask;
  onOpenTask: OpenTaskHandler;
}) {
  const body = (
    <div className="p-2">
      <p className="text-xs font-semibold leading-snug text-primary">{task.title}</p>
      <p className="mt-0.5 text-[10px] text-primary/50">{task.project}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <span className="text-[10px] font-medium text-accent">{task.progress}%</span>
      </div>
    </div>
  );

  if (!task.projectId) return <div>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onOpenTask(task.id, task.projectId as string)}
      className="block w-full rounded-lg text-left outline-none transition hover:bg-white/4 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {body}
    </button>
  );
}

// ─── Heatmap component ────────────────────────────────────────────────────────

function ActivityHeatmap({
  activity,
  onOpenTask,
}: {
  activity: ActivityMap;
  onOpenTask: OpenTaskHandler;
}) {
  const { weeks, monthCols } = useMemo(() => buildHeatmap(activity), [activity]);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [selected, setSelected] = useState<CellData | null>(null);
  const nWeeks = weeks.length;

  const totalReal = useMemo(
    () => weeks.flat().reduce((n, c) => n + c.tasks.length, 0),
    [weeks],
  );

  const handleEnter = useCallback((cell: CellData, e: React.MouseEvent) => {
    if (!cell.isCurrentYear) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ cell, rect });
  }, []);

  const openDay = useCallback(
    (cell: CellData) => {
      if (!cell.isCurrentYear) return;
      const openable = cell.tasks.filter((task) => task.projectId);
      if (openable.length === 1 && openable[0].projectId) {
        onOpenTask(openable[0].id, openable[0].projectId);
        return;
      }
      setSelected(cell);
    },
    [onOpenTask],
  );

  const tooltipStyle = tooltip
    ? (() => {
        const cx = tooltip.rect.left + tooltip.rect.width / 2;
        const TW = 220;
        const left = Math.max(TW / 2 + 8, Math.min(cx, window.innerWidth - TW / 2 - 8));
        return {
          left,
          top: tooltip.rect.top - 10,
          transform: "translate(-50%, -100%)",
        };
      })()
    : {};

  const selectedKey = selected ? toDateKey(selected.date) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-primary/40">
          {totalReal} task{totalReal !== 1 ? "s" : ""} scheduled in {new Date().getFullYear()}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-primary/40">
          <span>Less</span>
          {[0.08, 0.28, 0.52, 0.76, 1].map((op) => (
            <div key={op} className="size-[10px] rounded-sm bg-accent" style={{ opacity: op }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="relative mb-1 ml-7 h-[14px]">
        {monthCols.map(({ label, col }) => (
          <span
            key={label}
            className="absolute text-[10px] text-primary/40"
            style={{ left: `${(col / nWeeks) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <div className="flex w-6 shrink-0 flex-col gap-[3px]">
          {DAY_LABELS.map((lbl, i) => (
            <div key={i} className="flex flex-1 items-center text-[10px] text-primary/35">
              {lbl}
            </div>
          ))}
        </div>

        <div
          className="grid min-w-0 flex-1 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${nWeeks}, 1fr)` }}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => {
                const isSelected = selectedKey === toDateKey(cell.date);
                return (
                  <button
                    key={di}
                    type="button"
                    aria-label={
                      cell.isCurrentYear
                        ? `${toDateKey(cell.date)}${cell.tasks.length ? `, ${cell.tasks.length} tasks` : ""}`
                        : undefined
                    }
                    className={cn(
                      "relative aspect-square w-full rounded-[2px] bg-accent transition-transform hover:z-10 hover:scale-[1.25]",
                      isSelected && "ring-1 ring-primary/70",
                    )}
                    style={{
                      opacity: !cell.isCurrentYear
                        ? 0
                        : cell.count === 0 ? 0.08
                        : cell.count === 1 ? 0.28
                        : cell.count === 2 ? 0.52
                        : cell.count === 3 ? 0.76
                        : 1,
                      pointerEvents: cell.isCurrentYear ? undefined : "none",
                    }}
                    onMouseEnter={(e) => handleEnter(cell, e)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => openDay(cell)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-300 w-[210px] rounded-xl border border-glass bg-sidebar px-3 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          style={tooltipStyle}
        >
          <p className="text-[11px] font-semibold text-primary/50">
            {tooltip.cell.date.toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
            })}
          </p>

          {tooltip.cell.tasks.length > 0 ? (
            <div className="mt-2 space-y-2.5">
              {tooltip.cell.tasks.map((t) => (
                <div key={t.id}>
                  <p className="text-xs font-semibold leading-snug text-primary">{t.title}</p>
                  <p className="mt-0.5 text-[10px] text-primary/50">{t.project}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-accent">
                      {t.progress}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : tooltip.cell.count > 0 ? (
            <p className="mt-1 text-[11px] text-primary/45">
              {tooltip.cell.count} contribution{tooltip.cell.count !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-primary/35">No activity</p>
          )}
        </div>
      )}

      {selected ? (
        <div className="mt-4 rounded-xl border border-glass bg-glass-button/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/45">
            {selected.date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          {selected.tasks.length > 0 ? (
            <div className="mt-3 space-y-3">
              {selected.tasks.map((task) => (
                <HeatmapTaskRow
                  key={task.id}
                  task={task}
                  onOpenTask={onOpenTask}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-primary/45">No activity for this day.</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-primary/35">
          Click a day to open that day's work.
        </p>
      )}
    </div>
  );
}

// ─── Urgent tasks table ───────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  High:   "bg-red-500 light:bg-red-600",
  Medium: "bg-amber-500 light:bg-amber-600",
  Low:    "bg-emerald-500 light:bg-emerald-600",
};

function UrgentTasksTable({
  tasks,
  onOpenTask,
}: {
  tasks: UrgentTask[];
  onOpenTask: OpenTaskHandler;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-primary/40">
        No open tasks with due dates.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-glass">
            <th className="pb-3 text-left text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Task
            </th>
            <th className="pb-3 text-left text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Project
            </th>
            <th className="pb-3 text-right text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Due
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const label = task.dueLabel.toLowerCase();
            const isOverdue = label.includes("overdue");
            const isToday = label === "today";
            const canOpen = Boolean(task.projectId);

            return (
              <tr
                key={task.id}
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                onClick={() => {
                  if (task.projectId) onOpenTask(task.id, task.projectId);
                }}
                onKeyDown={(event) => {
                  if (!task.projectId) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTask(task.id, task.projectId);
                  }
                }}
                className={cn(
                  "group border-b border-glass/40 last:border-0 ",
                  canOpen && "cursor-pointer hover:bg-white/3",
                )}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5 pl-2">
                    <span
                      className={cn(
                        "mt-px size-2 shrink-0 rounded-full",
                        PRIORITY_DOT[task.priority] ?? "bg-primary/30",
                      )}
                    />
                    <span className="line-clamp-1 font-medium text-primary group-hover:text-accent">
                      {task.title}
                    </span>
                  </div>
                </td>

                <td className="py-3 pr-4">
                  <span className="rounded-md border border-glass bg-glass-button px-2 py-0.5 text-xs text-primary/65">
                    {task.projectName}
                  </span>
                </td>

                <td className="py-3 text-right pr-2">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isOverdue
                        ? "text-red-400 light:text-red-600"
                        : isToday
                        ? "text-amber-400 light:text-amber-600"
                        : "text-primary/55",
                    )}
                  >
                    {task.dueLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Continue strip ───────────────────────────────────────────────────────────

function ContinueStrip({
  data,
  onOpenTask,
}: {
  data: DashboardContinue;
  onOpenTask: OpenTaskHandler;
}) {
  const projectStamp = formatRelativeStamp(data.lastProject?.updatedAt);
  const boardStamp = formatRelativeStamp(data.lastWhiteboard?.lastEditedAt);

  return (
    <section id="continue" aria-label="Continue" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Link
        href={data.lastProject ? `/projects/${data.lastProject.id}` : "/projects"}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <GlassCard className="h-full border-glass p-4 transition hover:border-accent/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <FolderKanban className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
                Last project
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-primary">
                {data.lastProject?.name ?? "Open projects"}
              </p>
              <p className="mt-0.5 text-[11px] text-primary/45">
                {data.lastProject
                  ? projectStamp
                    ? `Updated ${projectStamp}`
                    : "Pick up where you left off"
                  : "No project yet"}
              </p>
            </div>
          </div>
        </GlassCard>
      </Link>

      <Link
        href={
          data.lastWhiteboard
            ? `/whiteboard/${data.lastWhiteboard.id}`
            : "/whiteboard"
        }
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <GlassCard className="h-full border-glass p-4 transition hover:border-accent/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <PenLine className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
                Last whiteboard
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-primary">
                {data.lastWhiteboard?.title ?? "Open boards"}
              </p>
              <p className="mt-0.5 text-[11px] text-primary/45">
                {data.lastWhiteboard
                  ? boardStamp
                    ? `Edited ${boardStamp}`
                    : "Jump back into the board"
                  : "No board yet"}
              </p>
            </div>
          </div>
        </GlassCard>
      </Link>

      <GlassCard className="h-full border-glass p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <CalendarDays className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
              Due today
            </p>
            {data.dueToday.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {data.dueToday.map((task) => {
                  const label = (
                    <>
                      <span className="line-clamp-1 text-sm font-semibold text-primary">
                        {task.title}
                      </span>
                      {task.projectName ? (
                        <span className="block truncate text-[11px] text-primary/45">
                          {task.projectName}
                        </span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={task.id}>
                      {task.projectId ? (
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id, task.projectId as string)}
                          className="block w-full rounded-md text-left outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-primary/50">Nothing due today</p>
            )}
            <Link
              href="/timeline?filter=today"
              className="mt-2 inline-block text-[11px] font-medium text-accent/80 hover:text-accent"
            >
              Today's timeline
            </Link>
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function showApiError(
  toast: ReturnType<typeof useToast>["toast"],
  section: string,
  err: unknown,
) {
  toast({
    variant: "error",
    title: `Failed to load ${section}`,
    message:
      err instanceof ApiError ? err.message : "Please try again later.",
  });
}

const EMPTY_CONTINUE: DashboardContinue = {
  lastProject: null,
  lastWhiteboard: null,
  dueToday: [],
};

export default function DashboardPage() {
  const { toast } = useToast();
  const { updateTask, deleteTask } = useAppData();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [activity, setActivity] = useState<ActivityMap>({});
  const [activityLoading, setActivityLoading] = useState(true);

  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);

  const [continueData, setContinueData] = useState<DashboardContinue | null>(null);
  const [continueLoading, setContinueLoading] = useState(true);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<
    string | null
  >(null);
  const drawerContext = useTaskDrawerContext(selectedTaskProjectId);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    taskId: string;
    projectId: string;
    title: string;
  } | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getDashboardMetricsApi();
      setMetrics(data);
    } catch (err) {
      showApiError(toast, "metrics", err);
    } finally {
      setMetricsLoading(false);
    }
  }, [toast]);

  const loadActivity = useCallback(async () => {
    try {
      const data = await getDashboardActivityApi();
      setActivity(data);
    } catch (err) {
      showApiError(toast, "activity", err);
    } finally {
      setActivityLoading(false);
    }
  }, [toast]);

  const loadUrgentTasks = useCallback(async () => {
    try {
      const data = await getDashboardUrgentTasksApi();
      setUrgentTasks(data);
    } catch (err) {
      showApiError(toast, "urgent tasks", err);
    } finally {
      setUrgentLoading(false);
    }
  }, [toast]);

  const loadContinue = useCallback(async () => {
    try {
      const data = await getDashboardContinueApi();
      setContinueData(data);
    } catch {
      setContinueData(EMPTY_CONTINUE);
    } finally {
      setContinueLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      loadMetrics(),
      loadActivity(),
      loadUrgentTasks(),
      loadContinue(),
    ]);
  }, [loadActivity, loadContinue, loadMetrics, loadUrgentTasks]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const openTask = useCallback(
    async (taskId: string, projectId: string) => {
      setSelectedTaskId(taskId);
      setSelectedTaskProjectId(projectId);
      setDrawerTask(null);
      setDrawerLoading(true);
      try {
        const task = await getTaskApi(taskId);
        setDrawerTask(task);
      } catch (err) {
        toast({
          variant: "error",
          title: "Could not load task",
          message: err instanceof ApiError ? err.message : "Please try again.",
        });
        setSelectedTaskId(null);
        setSelectedTaskProjectId(null);
      } finally {
        setDrawerLoading(false);
      }
    },
    [toast],
  );

  const handleSaveTask = async (updated: Task) => {
    if (!selectedTaskProjectId) return;
    try {
      const saved = await updateTask(selectedTaskProjectId, updated);
      setDrawerTask(saved);
      setSelectedTaskId(saved.id);
      toast({ variant: "success", title: "Task saved" });
      await refreshDashboard();
    } catch (err) {
      toast({
        variant: "error",
        title: "Save failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask(deleteTarget.projectId, deleteTarget.taskId);
      toast({ variant: "success", title: "Task deleted" });
      setSelectedTaskId(null);
      setSelectedTaskProjectId(null);
      setDrawerTask(null);
      setDeleteTarget(null);
      await refreshDashboard();
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const closeDrawer = () => {
    setSelectedTaskId(null);
    setSelectedTaskProjectId(null);
    setDrawerTask(null);
  };

  const metricCards = useMemo(() => {
    if (!metrics) return [];
    const meta = metrics._meta;
    return [
      {
        label: "Tasks Due Today",
        value: String(metrics.tasksDueToday),
        hint: meta?.totalAssignedTasks
          ? `${meta.totalAssignedTasks} assigned overall`
          : undefined,
        href: "/timeline?filter=today",
      },
      {
        label: "Active Projects",
        value: String(metrics.activeProjectsCount),
        href: "/projects",
      },
      {
        label: "Productivity Score",
        value: `${metrics.productivityPercentage}%`,
        hint:
          meta?.totalSubtasks != null && meta.completedSubtasks != null
            ? `${meta.completedSubtasks} / ${meta.totalSubtasks} subtasks`
            : undefined,
        href: "/projects",
      },
    ];
  }, [metrics]);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-primary/60">
          Your workspace overview for {dateStr}
        </p>
      </div>

      {continueLoading ? (
        <ContinueStripSkeleton />
      ) : (
        <ContinueStrip
          data={continueData ?? EMPTY_CONTINUE}
          onOpenTask={openTask}
        />
      )}

      {metricsLoading ? (
        <MetricsCardsSkeleton />
      ) : metrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {metricCards.map(({ label, value, hint, href }) => (
            <Link
              key={label}
              href={href}
              className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <GlassCard className="h-full border-glass transition hover:border-accent/40">
                <p className="text-sm text-primary/60">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-accent">{value}</p>
                {hint ? (
                  <p className="mt-1 text-[11px] text-primary/45">{hint}</p>
                ) : null}
              </GlassCard>
            </Link>
          ))}
        </div>
      ) : null}

      <GlassCard title="Recent Activity">
        {activityLoading ? (
          <ActivityHeatmapSkeleton />
        ) : (
          <ActivityHeatmap activity={activity} onOpenTask={openTask} />
        )}
      </GlassCard>

      <GlassCard title="Urgent Tasks">
        {urgentLoading ? (
          <UrgentTasksTableSkeleton />
        ) : (
          <UrgentTasksTable tasks={urgentTasks} onOpenTask={openTask} />
        )}
      </GlassCard>

      <SideDrawer
        isOpen={Boolean(selectedTaskId)}
        onClose={closeDrawer}
        title="Task Details"
      >
        {drawerLoading ? (
          <p className="py-8 text-center text-sm text-primary/50">
            Loading task…
          </p>
        ) : drawerTask && selectedTaskProjectId ? (
          <TaskDrawerDetails
            key={drawerTask.id}
            projectId={selectedTaskProjectId}
            task={drawerTask}
            onSave={handleSaveTask}
            onDelete={() =>
              setDeleteTarget({
                taskId: drawerTask.id,
                projectId: selectedTaskProjectId,
                title: drawerTask.title,
              })
            }
            readOnly={drawerContext.readOnly}
            projectRole={drawerContext.currentRole}
            mentionUsers={drawerContext.mentionUsers}
            canAssignTasks={drawerContext.canAssignTasks}
            assigneeOptions={drawerContext.assigneeOptions}
            canAssignSubtasks={drawerContext.canAssignSubtasks}
            subtaskAssigneeOptions={drawerContext.subtaskAssigneeOptions}
          />
        ) : null}
      </SideDrawer>

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTask}
        title="Delete task?"
        itemName={deleteTarget?.title}
      />
    </div>
  );
}
