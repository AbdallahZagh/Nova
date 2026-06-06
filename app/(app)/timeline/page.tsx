"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TimelineSkeleton } from "@/components/skeletons/TimelineSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Select } from "@/components/ui/Select";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import {
  getTimelineApi,
  type TimelineFilter,
  type TimelineTask,
} from "@/lib/api/timeline";
import { getTaskApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Task, TaskStatus } from "@/lib/tasks";

// ── Layout constants ──────────────────────────────────────────────────────────

const BAR_H = 28;
const LANE_H = 38;
const ROW_PAD = 12;
const HDR_H = 48;
const LEFT_W = 172;
const BAR_GAP = 6;
const MIN_BAR_W = 40;

/** Pixels per day for each filter.
 *  Monthly/yearly must exceed typical viewport widths to force scrolling. */
const FILTER_DAY_PX: Record<TimelineFilter, number> = {
  today: 200,
  tomorrow: 200,
  weekly: 130,   // 7 days × 130 = 910 px
  monthly: 55,   // 30 days × 55 = 1650 px  → always scrollable
  yearly: 16,    // 365 days × 16 = 5840 px → always scrollable
};

const TIME_FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "yearly", label: "This year" },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function sod(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function eod(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDay(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : sod(d);
}

function dayOffset(date: Date, origin: Date): number {
  return Math.round((date.getTime() - origin.getTime()) / 86_400_000);
}

/** Last Saturday on or before today (week start). */
function prevSaturday(d: Date): Date {
  const x = sod(d);
  // getDay(): 0=Sun 1=Mon … 6=Sat
  const diff = (x.getDay() + 1) % 7; // days since last Sat
  x.setDate(x.getDate() - diff);
  return x;
}

/** Always returns a true calendar window regardless of what the API's filter
 *  definition says (e.g. API "monthly" = next 30 days, but we want June 1-30). */
function calendarWindow(filter: TimelineFilter): { start: Date; end: Date } {
  const today = sod(new Date());
  switch (filter) {
    case "today":
      return { start: today, end: eod(today) };
    case "tomorrow": {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return { start: sod(t), end: eod(t) };
    }
    case "weekly": {
      const sat = prevSaturday(today);
      const fri = new Date(sat);
      fri.setDate(fri.getDate() + 6); // Sat + 6 = Fri
      return { start: sat, end: eod(fri) };
    }
    case "yearly": {
      // Full calendar year: Jan 1 → Dec 31
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { start, end: eod(end) };
    }
    case "monthly":
    default: {
      // Full calendar month: Jun 1 → Jun 30
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start, end: eod(end) };
    }
  }
}

// ── Tick builder ──────────────────────────────────────────────────────────────

type Tick = { left: number; width: number; label: string; isMajor?: boolean };

function buildTicks(
  rangeStart: Date,
  totalDays: number,
  dayPx: number,
  filter: TimelineFilter,
): Tick[] {
  if (totalDays <= 0) return [];

  // today / tomorrow: one wide column per day with full weekday + date
  if (filter === "today" || filter === "tomorrow") {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      return {
        left: i * dayPx,
        width: dayPx,
        isMajor: true,
        label: d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
      };
    });
  }

  // weekly: one column per day  (Sat 3, Sun 4 …)
  if (filter === "weekly") {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      return {
        left: i * dayPx,
        width: dayPx,
        isMajor: true,
        label: d.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric",
        }),
      };
    });
  }

  // monthly: tick every 2 days
  if (totalDays <= 45) {
    const step = 2;
    const ticks: Tick[] = [];
    for (let i = 0; i < totalDays; i += step) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      ticks.push({
        left: i * dayPx,
        width: step * dayPx,
        label: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      });
    }
    return ticks;
  }

  // yearly: month segments
  const ticks: Tick[] = [];
  let cur = new Date(rangeStart);
  const end = new Date(rangeStart);
  end.setDate(end.getDate() + totalDays - 1);
  while (cur <= end) {
    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const segEnd = mEnd < end ? mEnd : end;
    const s = dayOffset(cur, rangeStart);
    const e = dayOffset(segEnd, rangeStart);
    ticks.push({
      left: s * dayPx,
      width: (e - s + 1) * dayPx,
      isMajor: true,
      label: cur.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return ticks;
}

// ── Types & lane assignment ───────────────────────────────────────────────────

type SpanTask = TimelineTask & {
  projectId: string;
  startPx: number;
  widthPx: number;
  lane: number;
  startDay: Date;
  dueDay: Date;
};

type ProjectRow = {
  projectId: string;
  title: string;
  tasks: SpanTask[];
  laneCount: number;
  rowHeight: number;
};

function assignLanes(tasks: Omit<SpanTask, "lane">[]): SpanTask[] {
  const sorted = [...tasks].sort((a, b) => a.startPx - b.startPx);
  const laneEnds: number[] = [];
  return sorted.map((task) => {
    const right = task.startPx + task.widthPx;
    let lane = laneEnds.findIndex((e) => e + BAR_GAP <= task.startPx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(right);
    } else {
      laneEnds[lane] = right;
    }
    return { ...task, lane };
  });
}

function makeSpan(
  item: TimelineTask,
  origin: Date,
  dayPx: number,
): Omit<SpanTask, "lane"> | null {
  const a = parseDay(item.startDate);
  const b = parseDay(item.dueDate);
  if (!a || !b) return null;
  const [s, e] = a <= b ? [a, b] : [b, a];
  const startPx = dayOffset(s, origin) * dayPx;
  const endPx = (dayOffset(e, origin) + 1) * dayPx;
  return {
    ...item,
    projectId: item.project.id,
    startPx,
    widthPx: Math.max(endPx - startPx, MIN_BAR_W),
    startDay: s,
    dueDay: e,
  };
}

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_BAR: Record<TaskStatus, string> = {
  "To Do":
    "bg-blue-500/25 border-blue-500/50 text-blue-100 light:bg-blue-100 light:border-blue-400 light:text-blue-900",
  "In Progress":
    "bg-amber-500/25 border-amber-500/50 text-amber-100 light:bg-amber-100 light:border-amber-400 light:text-amber-900",
  "In Review":
    "bg-violet-500/25 border-violet-500/50 text-violet-100 light:bg-violet-100 light:border-violet-400 light:text-violet-900",
  Completed:
    "bg-emerald-500/25 border-emerald-500/50 text-emerald-100 light:bg-emerald-100 light:border-emerald-400 light:text-emerald-900",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  "To Do": "bg-blue-400 light:bg-blue-600",
  "In Progress": "bg-amber-400 light:bg-amber-600",
  "In Review": "bg-violet-400 light:bg-violet-600",
  Completed: "bg-emerald-400 light:bg-emerald-700",
};

function normStatus(raw: string): TaskStatus {
  const s = raw.trim();
  if (s === "In Progress") return "In Progress";
  if (s === "In Review") return "In Review";
  if (s === "Completed" || s === "Done") return "Completed";
  return "To Do";
}

// ── TaskBar ───────────────────────────────────────────────────────────────────
// The label is offset by the current scrollLeft so the text stays visible
// even when the left portion of the bar is scrolled out of view.

function TaskBar({
  task,
  top,
  scrollLeft,
  onClick,
}: {
  task: SpanTask;
  top: number;
  scrollLeft: number;
  onClick: () => void;
}) {
  const status = normStatus(task.status);

  // How far has the left edge of the bar scrolled off the viewport?
  const hiddenLeft = Math.max(0, scrollLeft - task.startPx);
  // Clamp so label doesn't overflow the right edge
  const maxOffset = Math.max(0, task.widthPx - 20);
  const labelOffset = Math.min(hiddenLeft + 8, maxOffset);

  const rangeLabel = `${task.startDay.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${task.dueDay.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${task.title} · ${rangeLabel}`}
      className={cn(
        "absolute z-8 rounded-md border transition hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        STATUS_BAR[status],
      )}
      style={{ left: task.startPx, top, width: task.widthPx, height: BAR_H }}
    >
      {/* Sticky label: slides rightward so text stays at viewport's left edge */}
      <span
        className="absolute inset-y-0 right-1 flex items-center gap-1.5 overflow-hidden"
        style={{ left: labelOffset }}
      >
        <span
          className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
        />
        <span className="min-w-0 truncate text-[10px] font-medium sm:text-[11px]">
          {task.title}
        </span>
      </span>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { toast } = useToast();
  const { projects, projectsLoading, updateTask, deleteTask } = useAppData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame>>(0);
  const hasScrolledRef = useRef(false);

  const [timeFilter, setTimeFilter] = useState<TimelineFilter>("monthly");
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [timelineItems, setTimelineItems] = useState<TimelineTask[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<
    string | null
  >(null);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    taskId: string;
    projectId: string;
    title: string;
  } | null>(null);

  // Responsive: hide sidebar on small screens
  useEffect(() => {
    const update = () => setShowSidebar(window.innerWidth >= 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Track horizontal scroll for sticky labels
  const onScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
    });
  }, []);

  const dayPx = FILTER_DAY_PX[timeFilter];

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const items = await getTimelineApi({
        filter: timeFilter,
        ...(filterProjectId !== "all" ? { projectId: filterProjectId } : {}),
      });
      setTimelineItems(items);
      hasScrolledRef.current = false;
    } catch (err) {
      setTimelineItems([]);
      toast({
        variant: "error",
        title: "Could not load timeline",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setTimelineLoading(false);
    }
  }, [timeFilter, filterProjectId, toast]);

  useEffect(() => {
    if (!projectsLoading) loadTimeline();
  }, [projectsLoading, loadTimeline]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.title })),
    ],
    [projects],
  );

  const windowLabel = useMemo(
    () =>
      timelineItems[0]?.windowLabel ??
      TIME_FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label ??
      "Timeline",
    [timelineItems, timeFilter],
  );

  const { projectRows, rangeStart, totalDays, ticks, chartWidth, todayPx } =
    useMemo(() => {
      // Always use the true calendar window (June 1-30, Sat-Fri, Jan 1-Dec 31).
      // The API filter determines which tasks are returned; the chart always
      // covers the full calendar period so you can scroll through all of it.
      const { start: rangeStart, end: rangeEnd } = calendarWindow(timeFilter);

      const totalDays = Math.max(1, dayOffset(rangeEnd, rangeStart) + 1);
      const chartWidth = totalDays * dayPx;
      const ticks = buildTicks(rangeStart, totalDays, dayPx, timeFilter);

      const todayOff = dayOffset(sod(new Date()), rangeStart);
      const todayPx =
        todayOff >= 0 && todayOff < totalDays
          ? todayOff * dayPx + dayPx / 2
          : null;

      const spanTasks = timelineItems
        .map((item) => makeSpan(item, rangeStart, dayPx))
        .filter((t): t is Omit<SpanTask, "lane"> => t !== null);

      // Project order: preserve API order, fall back to projects list
      const seenIds = new Set<string>();
      const projectOrder: [string, string][] = [];
      for (const t of spanTasks) {
        if (!seenIds.has(t.projectId)) {
          seenIds.add(t.projectId);
          projectOrder.push([t.projectId, t.project.name]);
        }
      }
      if (filterProjectId !== "all") {
        const p = projects.find((x) => x.id === filterProjectId);
        if (p && !seenIds.has(p.id)) projectOrder.push([p.id, p.title]);
      }

      const projectRows: ProjectRow[] = projectOrder.map(
        ([projectId, title]) => {
          const raw = spanTasks.filter((t) => t.projectId === projectId);
          const tasks = assignLanes(raw);
          const laneCount = Math.max(
            1,
            tasks.reduce((m, t) => Math.max(m, t.lane + 1), 0),
          );
          const rowHeight = ROW_PAD * 2 + laneCount * LANE_H;
          return { projectId, title, tasks, laneCount, rowHeight };
        },
      );

      return { projectRows, rangeStart, totalDays, ticks, chartWidth, todayPx };
    }, [timelineItems, timeFilter, filterProjectId, projects, dayPx]);

  // On new data/filter: set initial scroll position.
  // today/tomorrow/weekly → x=0 (start of window is already today/this week)
  // monthly/yearly → scroll so today is 15% from left edge, letting you
  //                  scroll left to see the start of the period.
  useEffect(() => {
    if (hasScrolledRef.current || !scrollRef.current || timelineLoading)
      return;
    if (
      (timeFilter === "monthly" || timeFilter === "yearly") &&
      todayPx !== null
    ) {
      const offset = Math.max(
        0,
        todayPx - scrollRef.current.clientWidth * 0.15,
      );
      scrollRef.current.scrollLeft = offset;
    } else {
      scrollRef.current.scrollLeft = 0;
    }
    setScrollLeft(scrollRef.current.scrollLeft);
    hasScrolledRef.current = true;
  }, [timelineLoading, chartWidth, todayPx, timeFilter]);

  const openTask = useCallback(
    async (item: SpanTask) => {
      setSelectedTaskId(item.id);
      setSelectedTaskProjectId(item.projectId);
      setDrawerTask(null);
      setDrawerLoading(true);
      try {
        const task = await getTaskApi(item.id);
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
      await loadTimeline();
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
      await loadTimeline();
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const loading = projectsLoading || timelineLoading;
  if (loading && timelineItems.length === 0) return <TimelineSkeleton />;

  return (
    <div className="flex h-full flex-col gap-4 sm:gap-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-primary/55">
            {windowLabel} · {timelineItems.length} task
            {timelineItems.length !== 1 ? "s" : ""}
            {filterProjectId === "all"
              ? ` · ${projects.length} project${projects.length !== 1 ? "s" : ""}`
              : ""}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="w-full sm:w-40">
            <Select
              value={timeFilter}
              onChange={(v) => setTimeFilter(v as TimelineFilter)}
              options={TIME_FILTER_OPTIONS}
              variant="glass"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={filterProjectId}
              onChange={setFilterProjectId}
              options={projectOptions}
              variant="glass"
            />
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-5">
        {(["To Do", "In Progress", "In Review", "Completed"] as TaskStatus[]).map(
          (s) => (
            <div
              key={s}
              className="flex items-center gap-1.5 text-[11px] text-primary/60 sm:text-xs"
            >
              <div className={cn("size-2.5 rounded-sm", STATUS_DOT[s])} />
              {s}
            </div>
          ),
        )}
        {todayPx !== null && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent sm:ml-auto sm:text-xs">
            <div className="h-3 w-px bg-accent" />
            Today
          </div>
        )}
      </div>

      {/* ── Chart — fills remaining height ── */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-glass bg-glass-card shadow-sm">
        {projectRows.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <p className="text-sm font-medium text-primary/70">
              No tasks in this window
            </p>
            <p className="max-w-sm text-xs text-primary/40">
              Tasks need a start date and due date within{" "}
              {windowLabel.toLowerCase()}. Try a different time range.
            </p>
          </div>
        ) : (
          <div className="flex h-full">
            {/* ── Fixed sidebar: project names ── */}
            {showSidebar && (
              <div
                className="z-30 hidden h-full shrink-0 overflow-hidden border-r border-glass bg-glass-card/95 backdrop-blur-sm md:flex md:flex-col"
                style={{ width: LEFT_W }}
              >
                <div
                  className="flex shrink-0 items-end border-b border-glass px-3 pb-2"
                  style={{ height: HDR_H }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/35">
                    Project
                  </span>
                </div>
                <div className="flex-1 overflow-y-hidden">
                  {projectRows.map((row) => (
                    <div
                      key={row.projectId}
                      className="flex flex-col justify-center border-b border-glass/20 px-3 py-2"
                      style={{ height: row.rowHeight }}
                    >
                      <p
                        className="truncate text-sm font-semibold text-primary"
                        title={row.title}
                      >
                        {row.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-primary/40">
                        {row.tasks.length} task
                        {row.tasks.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Scrollable chart area ── */}
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="relative min-w-0 flex-1 overflow-x-auto overflow-y-auto"
              style={{ scrollbarWidth: "thin" }}
            >
              {/* Sticky date header — sits directly in the scroll container so it
                  can use minWidth: 100% to fill any extra space on the right,
                  while still scrolling horizontally with the content. */}
              <div
                className="sticky top-0 z-20 border-b border-glass bg-glass-card/96 backdrop-blur-sm"
                style={{ height: HDR_H, width: chartWidth, minWidth: "100%" }}
              >
                {/* Today line */}
                {todayPx !== null && (
                  <div
                    className="absolute inset-y-0 z-10 w-0.5 bg-accent"
                    style={{ left: todayPx }}
                  />
                )}

                {ticks.map((tick, i) => (
                  <div
                    key={`tick-${i}`}
                    className={cn(
                      "absolute inset-y-0 flex items-end border-r border-glass/30 pb-2",
                      tick.isMajor ? "px-2 sm:px-3" : "px-1 sm:px-2",
                    )}
                    style={{ left: tick.left, width: tick.width }}
                  >
                    <span
                      className={cn(
                        "truncate font-medium text-primary/50",
                        tick.isMajor
                          ? "text-[11px] sm:text-xs"
                          : "text-[10px] sm:text-[11px]",
                      )}
                    >
                      {tick.label}
                    </span>
                  </div>
                ))}

                {/* Today pill */}
                {todayPx !== null && (
                  <div
                    className="absolute bottom-1.5 z-20 -translate-x-1/2 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold tracking-wide text-white"
                    style={{ left: todayPx }}
                  >
                    Today
                  </div>
                )}
              </div>

              {/* Rows — exactly chartWidth wide so horizontal scroll works */}
              <div style={{ width: chartWidth }}>
                {/* Project rows */}
                {projectRows.map((row, rowIdx) => (
                  <div
                    key={row.projectId}
                    className={cn(
                      "relative border-b border-glass/20",
                      rowIdx % 2 === 1 && "bg-white/2",
                    )}
                    style={{ height: row.rowHeight }}
                  >
                    {/* Mobile: project name label sticky to left */}
                    {!showSidebar && (
                      <div className="sticky left-0 z-10 inline-flex max-w-[140px] items-center bg-glass-button/90 px-2 py-1 text-[10px] font-semibold text-primary backdrop-blur-sm">
                        <span className="truncate">{row.title}</span>
                      </div>
                    )}

                    {/* Grid lines at tick boundaries */}
                    {ticks.map((tick, i) => (
                      <div
                        key={`gl-${row.projectId}-${i}`}
                        className="pointer-events-none absolute inset-y-0 w-px bg-glass/40"
                        style={{ left: tick.left }}
                      />
                    ))}

                    {/* Today line through row */}
                    {todayPx !== null && (
                      <div
                        className="pointer-events-none absolute inset-y-0 z-5 w-px bg-accent/30"
                        style={{ left: todayPx }}
                      />
                    )}

                    {row.tasks.length === 0 && (
                      <div className="flex h-full items-center px-4">
                        <span className="text-[11px] italic text-primary/20">
                          No tasks in range
                        </span>
                      </div>
                    )}

                    {/* Task bars */}
                    {row.tasks.map((task) => {
                      const usableH = row.rowHeight - ROW_PAD * 2 - BAR_H;
                      const spacing =
                        row.laneCount > 1 ? usableH / (row.laneCount - 1) : 0;
                      const top =
                        row.laneCount === 1
                          ? (row.rowHeight - BAR_H) / 2
                          : ROW_PAD + task.lane * spacing;

                      return (
                        <TaskBar
                          key={task.id}
                          task={task}
                          top={top}
                          scrollLeft={scrollLeft}
                          onClick={() => openTask(task)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Task drawer ── */}
      <SideDrawer
        isOpen={Boolean(selectedTaskId)}
        onClose={() => {
          setSelectedTaskId(null);
          setSelectedTaskProjectId(null);
          setDrawerTask(null);
        }}
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
          />
        ) : null}
      </SideDrawer>

      {/* ── Delete confirm ── */}
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
