"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityHeatmapSkeleton,
  MetricsCardsSkeleton,
  UrgentTasksTableSkeleton,
} from "@/components/skeletons/DashboardSkeleton";
import { GlassCard } from "@/components/ui/GlassCard";
import { useToast } from "@/components/ui/Toast";
import {
  getDashboardActivityApi,
  getDashboardMetricsApi,
  getDashboardUrgentTasksApi,
  type ActivityMap,
  type DashboardMetrics,
  type UrgentTask,
} from "@/lib/api/dashboard";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CellData = {
  date: Date;
  isCurrentYear: boolean;
  count: number; // visual intensity (real + seeded)
  tasks: { title: string; project: string; progress: number }[];
};

type TooltipState = { cell: CellData; rect: DOMRect } | null;

// ─── Heatmap builder ──────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function buildHeatmap(activity: ActivityMap) {
  const year = new Date().getFullYear();

  const taskMap = new Map<string, { title: string; project: string; progress: number }[]>();
  for (const [isoKey, entries] of Object.entries(activity)) {
    if (!entries?.length) continue;
    const d = new Date(isoKey);
    if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    taskMap.set(
      isoKey,
      entries.map((t) => ({
        title: t.title,
        project: t.projectName,
        progress: Math.round(t.completionPercentage),
      })),
    );
  }

  // Grid start: Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay(); // 0=Sun
  const back = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - back);

  // Grid end: Sunday on or after Dec 31
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

      // Month label at start of each month (row 0 only)
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

// ─── Heatmap component ────────────────────────────────────────────────────────

function ActivityHeatmap({ activity }: { activity: ActivityMap }) {
  const { weeks, monthCols } = useMemo(() => buildHeatmap(activity), [activity]);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
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

  // Tooltip: clamp horizontally so it never goes off-screen
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

  return (
    <div>
      {/* Header row */}
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

      {/* Month labels — percentage-based so they scale with width */}
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

      {/* Day labels + full-width weeks grid */}
      <div className="flex gap-1.5">
        {/* Day labels: gap-[3px] + flex-1 rows → each row height === cell height exactly */}
        <div className="flex w-6 shrink-0 flex-col gap-[3px]">
          {DAY_LABELS.map((lbl, i) => (
            <div key={i} className="flex flex-1 items-center text-[10px] text-primary/35">
              {lbl}
            </div>
          ))}
        </div>

        {/* Weeks: 1fr per column, aspect-square cells fill all available width */}
        <div
          className="grid min-w-0 flex-1 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${nWeeks}, 1fr)` }}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => (
                <button
                  key={di}
                  type="button"
                  aria-label={cell.isCurrentYear ? toDateKey(cell.date) : undefined}
                  className="aspect-square w-full rounded-[2px] bg-accent transition-transform hover:scale-[1.25] hover:z-10 relative"
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
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Floating tooltip */}
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
              {tooltip.cell.tasks.map((t, i) => (
                <div key={i}>
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
    </div>
  );
}

// ─── Urgent tasks table ───────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  High:   "bg-red-500 light:bg-red-600",
  Medium: "bg-amber-500 light:bg-amber-600",
  Low:    "bg-emerald-500 light:bg-emerald-600",
};

function UrgentTasksTable({ tasks }: { tasks: UrgentTask[] }) {
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

            return (
              <tr
                key={task.id}
                className="group border-b border-glass/40 last:border-0 hover:bg-white/3"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "mt-px size-2 shrink-0 rounded-full",
                        PRIORITY_DOT[task.priority] ?? "bg-primary/30",
                      )}
                    />
                    <span className="line-clamp-1 font-medium text-primary">
                      {task.title}
                    </span>
                  </div>
                </td>

                <td className="py-3 pr-4">
                  <span className="rounded-md border border-glass bg-glass-button px-2 py-0.5 text-xs text-primary/65">
                    {task.projectName}
                  </span>
                </td>

                <td className="py-3 text-right">
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

export default function DashboardPage() {
  const { toast } = useToast();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [activity, setActivity] = useState<ActivityMap>({});
  const [activityLoading, setActivityLoading] = useState(true);

  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardMetricsApi()
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((err) => {
        if (!cancelled) showApiError(toast, "metrics", err);
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    getDashboardActivityApi()
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch((err) => {
        if (!cancelled) showApiError(toast, "activity", err);
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    getDashboardUrgentTasksApi()
      .then((data) => {
        if (!cancelled) setUrgentTasks(data);
      })
      .catch((err) => {
        if (!cancelled) showApiError(toast, "urgent tasks", err);
      })
      .finally(() => {
        if (!cancelled) setUrgentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

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
      },
      {
        label: "Active Projects",
        value: String(metrics.activeProjectsCount),
      },
      {
        label: "Productivity Score",
        value: `${metrics.productivityPercentage}%`,
        hint:
          meta?.totalSubtasks != null && meta.completedSubtasks != null
            ? `${meta.completedSubtasks} / ${meta.totalSubtasks} subtasks`
            : undefined,
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

      {/* GET /api/dashboard/metrics */}
      {metricsLoading ? (
        <MetricsCardsSkeleton />
      ) : metrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {metricCards.map(({ label, value, hint }) => (
            <GlassCard key={label}>
              <p className="text-sm text-primary/60">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-accent">{value}</p>
              {hint ? (
                <p className="mt-1 text-[11px] text-primary/45">{hint}</p>
              ) : null}
            </GlassCard>
          ))}
        </div>
      ) : null}

      {/* GET /api/dashboard/activity */}
      <GlassCard title="Recent Activity">
        {activityLoading ? (
          <ActivityHeatmapSkeleton />
        ) : (
          <ActivityHeatmap activity={activity} />
        )}
      </GlassCard>

      {/* GET /api/dashboard/urgent-tasks */}
      <GlassCard title="Urgent Tasks">
        {urgentLoading ? (
          <UrgentTasksTableSkeleton />
        ) : (
          <UrgentTasksTable tasks={urgentTasks} />
        )}
      </GlassCard>
    </div>
  );
}
