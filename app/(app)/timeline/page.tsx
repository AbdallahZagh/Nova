"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TimelineSkeleton } from "@/components/skeletons/TimelineSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Select } from "@/components/ui/Select";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Task, TaskStatus } from "@/lib/tasks";

// ── Layout constants ──────────────────────────────────────────────────────────

const DAY_PX = 28;    // pixels per calendar day
const BAR_W  = 120;   // fixed width of each task bar in px
const BAR_H  = 28;    // height of each task bar in px
const LANE_H = 42;    // height per lane (bar + gap)
const ROW_PAD = 10;   // vertical padding inside each project row
const LEFT_W = 160;   // width of the fixed project-name panel
const HDR_H  = 52;    // height of the month-header row
const BAR_GAP = 8;    // minimum px gap between adjacent bars in the same lane

// ── Date utilities ────────────────────────────────────────────────────────────

const MONTH_IDX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDueDate(raw: string): Date | null {
  if (!raw || raw === "TBD") return null;
  const [mon, dayStr] = raw.trim().split(/\s+/);
  const month = MONTH_IDX[mon];
  const day = parseInt(dayStr, 10);
  if (month === undefined || isNaN(day)) return null;
  const year = new Date().getFullYear();
  const d = new Date(year, month, day);
  // If more than ~6 months in the past, assume next year
  if (Date.now() - d.getTime() > 1000 * 60 * 60 * 24 * 180) d.setFullYear(year + 1);
  return d;
}

function dayOffset(date: Date, origin: Date): number {
  return Math.round((date.getTime() - origin.getTime()) / 86_400_000);
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichedTask = Task & {
  projectId: string;
  parsedDate: Date;
  lane: number;
};

type ProjectRow = {
  projectId: string;
  title: string;
  tasks: EnrichedTask[];
  laneCount: number;
  rowHeight: number;
};

type MonthSegment = { label: string; left: number; width: number };

// ── Lane assignment ───────────────────────────────────────────────────────────

function assignLanes(
  tasks: (Task & { projectId: string; parsedDate: Date })[],
  origin: Date,
): EnrichedTask[] {
  const sorted = [...tasks].sort(
    (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime(),
  );
  const laneEndPx: number[] = [];

  return sorted.map((task) => {
    const barRight = dayOffset(task.parsedDate, origin) * DAY_PX;
    const barLeft = barRight - BAR_W;

    let lane = laneEndPx.findIndex((endPx) => endPx + BAR_GAP <= barLeft);
    if (lane === -1) {
      lane = laneEndPx.length;
      laneEndPx.push(barRight);
    } else {
      laneEndPx[lane] = barRight;
    }

    return { ...task, lane };
  });
}

// ── Style maps ────────────────────────────────────────────────────────────────

const STATUS_BAR: Record<TaskStatus, string> = {
  "To Do": "bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30 light:bg-blue-100 light:border-blue-400 light:text-blue-800 light:hover:bg-blue-200",
  "In Progress": "bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 light:bg-amber-100 light:border-amber-400 light:text-amber-900 light:hover:bg-amber-200",
  "In Review": "bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30 light:bg-violet-100 light:border-violet-400 light:text-violet-900 light:hover:bg-violet-200",
  Completed:
    "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 light:bg-emerald-100 light:border-emerald-400 light:text-emerald-900 light:hover:bg-emerald-200",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  "To Do": "bg-blue-400 light:bg-blue-600",
  "In Progress": "bg-amber-400 light:bg-amber-600",
  "In Review": "bg-violet-400 light:bg-violet-600",
  Completed: "bg-emerald-400 light:bg-emerald-700",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const { toast } = useToast();
  const { projects, projectsLoading, getTasks, updateTask, deleteTask } =
    useAppData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const [filterProjectId, setFilterProjectId] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Tracks available chart body height so rows fill the viewport
  const [minChartH, setMinChartH] = useState(560);
  // Hide left panel on small screens — chart takes full width on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      setMinChartH(Math.max(400, window.innerHeight - 310));
      setIsMobile(window.innerWidth < 768);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    taskId: string;
    projectId: string;
    title: string;
  } | null>(null);

  // ── Project filter options ──────────────────────────────────────────────────

  const projectOptions = useMemo(
    () => [
      { value: "all", label: "All Projects" },
      ...projects.map((p) => ({ value: p.id, label: p.title })),
    ],
    [projects],
  );

  // ── Chart data ──────────────────────────────────────────────────────────────

  const { projectRows, rangeStart, totalDays, months } = useMemo(() => {
    const visible =
      filterProjectId === "all"
        ? projects
        : projects.filter((p) => p.id === filterProjectId);

    // Collect tasks that have a parseable due date
    const allTasks = visible.flatMap((p) =>
      getTasks(p.id).flatMap((task) => {
        const parsedDate = parseDueDate(task.dueDate);
        if (!parsedDate) return [];
        return [{ ...task, projectId: p.id, parsedDate }];
      }),
    );

    // Date range defaults: 1 month before today → 2 months after today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let earliest = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    let latest = new Date(today.getFullYear(), today.getMonth() + 2, 1);

    for (const t of allTasks) {
      if (t.parsedDate < earliest) earliest = t.parsedDate;
      if (t.parsedDate > latest) latest = t.parsedDate;
    }

    // Snap to month boundaries with 1-month padding on each side
    const rangeStart = monthStart(
      new Date(earliest.getFullYear(), earliest.getMonth() - 1, 1),
    );
    const rangeEnd = monthEnd(
      new Date(latest.getFullYear(), latest.getMonth() + 1, 0),
    );
    const totalDays = dayOffset(rangeEnd, rangeStart) + 1;

    // Month header segments
    const months: MonthSegment[] = [];
    let cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
      const end = monthEnd(cur);
      months.push({
        label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        left: dayOffset(cur, rangeStart) * DAY_PX,
        width: (dayOffset(end, cur) + 1) * DAY_PX,
      });
      cur = nextMonth(cur);
    }

    // Each row gets at least enough height to distribute the full chart body
    const minRowH = Math.floor(
      (minChartH - HDR_H) / Math.max(1, visible.length),
    );

    // Build project rows
    const projectRows: ProjectRow[] = visible.map((project) => {
      const raw = allTasks.filter((t) => t.projectId === project.id);
      const tasks = assignLanes(raw, rangeStart);
      const laneCount = tasks.reduce((max, t) => Math.max(max, t.lane + 1), 1);
      const naturalH = ROW_PAD + laneCount * LANE_H + ROW_PAD;
      const rowHeight = Math.max(naturalH, minRowH);
      return {
        projectId: project.id,
        title: project.title,
        tasks,
        laneCount,
        rowHeight,
      };
    });

    return { projectRows, rangeStart, totalDays, months };
  }, [projects, getTasks, filterProjectId, minChartH]);

  const chartWidth = totalDays * DAY_PX;

  // Today x-position
  const todayPx = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const offset = dayOffset(today, rangeStart);
    if (offset < 0 || offset > totalDays) return null;
    return offset * DAY_PX;
  }, [rangeStart, totalDays]);

  // Auto-scroll to today on first valid render
  useEffect(() => {
    if (!hasScrolledRef.current && scrollRef.current && todayPx !== null) {
      const half = scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, todayPx - half);
      hasScrolledRef.current = true;
    }
  }, [todayPx]);

  // Selected task derived from live store
  const selectedTask = useMemo(() => {
    if (!selectedTaskId || !selectedTaskProjectId) return null;
    return getTasks(selectedTaskProjectId).find((t) => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, selectedTaskProjectId, getTasks]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTaskClick = (task: EnrichedTask) => {
    setSelectedTaskId(task.id);
    setSelectedTaskProjectId(task.projectId);
  };

  const handleSaveTask = async (updated: Task) => {
    if (!selectedTaskProjectId) return;
    try {
      const saved = await updateTask(selectedTaskProjectId, updated);
      setSelectedTaskId(saved.id);
      toast({ variant: "success", title: "Task saved" });
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
      setDeleteTarget(null);
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const totalTaskCount = projectRows.reduce((sum, r) => sum + r.tasks.length, 0);

  if (projectsLoading) {
    return <TimelineSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Timeline</h1>
          <p className="mt-1 text-sm text-primary/55">
            Gantt view · {totalTaskCount} task{totalTaskCount !== 1 ? "s" : ""} across{" "}
            {filterProjectId === "all" ? projects.length : 1} project
            {filterProjectId === "all" && projects.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="w-56">
          <Select
            value={filterProjectId}
            onChange={setFilterProjectId}
            options={projectOptions}
            variant="glass"
          />
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-5">
        {(
          ["To Do", "In Progress", "In Review", "Completed"] as TaskStatus[]
        ).map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-primary/60">
            <div className={cn("size-2.5 rounded-sm", STATUS_DOT[s])} />
            {s}
          </div>
        ))}
        {todayPx !== null && (
          <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-accent">
            <div className="h-3 w-px bg-accent" />
            Today
          </div>
        )}
      </div>

      {/* ── Gantt chart ── */}
      <div className="overflow-hidden rounded-2xl border border-glass bg-glass-card">
        <div className="flex min-h-0">
          {/* ── Fixed left panel: project names — hidden on mobile ── */}
          {!isMobile && (
            <div
              className="z-10 shrink-0 border-r border-glass bg-glass-card"
              style={{ width: LEFT_W }}
            >
              {/* Header spacer aligned with month-header row */}
              <div
                style={{ height: HDR_H }}
                className="flex items-end border-b border-glass px-4 pb-2.5"
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/35">
                  Project
                </span>
              </div>

              {projectRows.map((row) => (
                <div
                  key={row.projectId}
                  style={{ height: row.rowHeight }}
                  className="flex flex-col justify-center border-b border-glass/25 px-4"
                >
                  <p
                    className="truncate text-sm font-semibold text-primary"
                    title={row.title}
                  >
                    {row.title}
                  </p>
                  <p className="mt-0.5 text-xs text-primary/40">
                    {row.tasks.length === 0
                      ? "No scheduled tasks"
                      : `${row.tasks.length} task${row.tasks.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Scrollable chart ── */}
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ width: Math.max(chartWidth, 400) }}>
              {/* Month header row */}
              <div
                className="relative border-b border-glass"
                style={{ height: HDR_H }}
              >
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="absolute inset-y-0 flex items-end border-r border-glass/25 pl-3 pb-2.5 text-xs font-semibold text-primary/50"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}

                {/* Today marker + label in header */}
                {todayPx !== null && (
                  <>
                    <div
                      className="absolute inset-y-0 z-10 w-px bg-accent/80"
                      style={{ left: todayPx }}
                    />
                    <div
                      className="absolute bottom-2 z-10 -translate-x-1/2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                      style={{ left: todayPx }}
                    >
                      Today
                    </div>
                  </>
                )}
              </div>

              {/* Project rows */}
              {projectRows.map((row, rowIdx) => (
                <div
                  key={row.projectId}
                  className={cn(
                    "relative border-b border-glass/20",
                    rowIdx % 2 === 1 && "bg-white/[0.018]",
                  )}
                  style={{ height: row.rowHeight }}
                >
                  {/* Mobile: project name label inside the row */}
                  {isMobile && (
                    <div className="absolute left-2 top-2 z-20 max-w-[120px] truncate rounded-md bg-glass-button/80 px-2 py-0.5 text-[10px] font-semibold text-primary/70 backdrop-blur-sm">
                      {row.title}
                    </div>
                  )}

                  {/* Vertical month gridlines */}
                  {months.map((m) => (
                    <div
                      key={m.label}
                      className="absolute inset-y-0 w-px bg-glass/50"
                      style={{ left: m.left }}
                    />
                  ))}

                  {/* Today line through row */}
                  {todayPx !== null && (
                    <div
                      className="absolute inset-y-0 z-10 w-px bg-accent/35"
                      style={{ left: todayPx }}
                    />
                  )}

                  {/* Empty row hint */}
                  {row.tasks.length === 0 && (
                    <div className="absolute inset-0 flex items-center pl-4">
                      <span className="text-[11px] italic text-primary/20">
                        No tasks with due dates
                      </span>
                    </div>
                  )}

                  {/* Task bars — lanes distributed evenly across row height */}
                  {row.tasks.map((task) => {
                    const barRight = dayOffset(task.parsedDate, rangeStart) * DAY_PX;
                    const barLeft = Math.max(0, barRight - BAR_W);

                    // Spread lanes evenly from top-pad to bottom-pad
                    const usableH = row.rowHeight - 2 * ROW_PAD - BAR_H;
                    const laneSpacing =
                      row.laneCount > 1 ? usableH / (row.laneCount - 1) : 0;
                    const top =
                      row.laneCount === 1
                        ? (row.rowHeight - BAR_H) / 2  // vertically center single lane
                        : ROW_PAD + task.lane * laneSpacing;

                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => handleTaskClick(task)}
                        title={`${task.title} · Due ${task.dueDate}`}
                        className={cn(
                          "absolute flex items-center gap-1.5 truncate rounded-md px-2.5",
                          "text-[11px] font-medium transition-all duration-150 cursor-pointer",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          STATUS_BAR[task.status],
                        )}
                        style={{ left: barLeft, top, width: BAR_W, height: BAR_H }}
                      >
                        {/* Due date dot at right edge */}
                        <span
                          className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[task.status])}
                        />
                        <span className="min-w-0 truncate">{task.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Task detail drawer ── */}
      <SideDrawer
        isOpen={Boolean(selectedTask)}
        onClose={() => {
          setSelectedTaskId(null);
          setSelectedTaskProjectId(null);
        }}
        title="Task Details"
      >
        {selectedTask && selectedTaskProjectId ? (
          <TaskDrawerDetails
            key={selectedTask.id}
            projectId={selectedTaskProjectId}
            task={selectedTask}
            onSave={handleSaveTask}
            onDelete={() =>
              setDeleteTarget({
                taskId: selectedTask.id,
                projectId: selectedTaskProjectId,
                title: selectedTask.title,
              })
            }
          />
        ) : null}
      </SideDrawer>

      {/* ── Delete confirmation ── */}
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
