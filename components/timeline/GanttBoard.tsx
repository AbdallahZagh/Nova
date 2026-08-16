"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { TimelineFilter, TimelineTask } from "@/lib/api/timeline";
import {
  ROW_H,
  GROUP_H,
  HDR_H,
  LEFT_W,
  STATUS_BAR,
  STATUS_DOT,
  STATUS_RAIL,
  sod,
  parseDay,
  dayOffset,
  normStatus,
  formatDue,
} from "@/lib/timeline/layout";

type SpanTask = TimelineTask & {
  projectId: string;
  startPx: number;
  widthPx: number;
  startDay: Date;
  dueDay: Date;
};

type ProjectGroup = {
  projectId: string;
  title: string;
  tasks: SpanTask[];
};

type Tick = { left: number; width: number; label: string; sub?: string; isToday: boolean };

function buildGanttTicks(
  rangeStart: Date,
  totalDays: number,
  dayPx: number,
  filter: TimelineFilter,
): Tick[] {
  const today = sod(new Date());
  if (filter === "yearly") {
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
        label: cur.toLocaleDateString("en-US", { month: "short" }),
        isToday: cur.getMonth() === today.getMonth(),
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return ticks;
  }

  return Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    return {
      left: i * dayPx,
      width: dayPx,
      label: String(d.getDate()),
      sub: d.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: dayOffset(d, today) === 0,
    };
  });
}

function makeGanttSpan(
  item: TimelineTask,
  origin: Date,
  rangeEnd: Date,
  dayPx: number,
): SpanTask | null {
  if (!item.project?.id) return null;
  const due = parseDay(item.dueDate);
  if (!due) return null;
  const created = parseDay(item.startDate) ?? due;
  let start = created <= due ? created : due;
  let end = due;
  if (end < origin || start > sod(rangeEnd)) return null;
  if (start < origin) start = origin;
  if (end > sod(rangeEnd)) end = sod(rangeEnd);
  const startPx = dayOffset(start, origin) * dayPx;
  const endPx = (dayOffset(end, origin) + 1) * dayPx;
  return {
    ...item,
    projectId: item.project.id,
    startPx,
    widthPx: Math.max(endPx - startPx, Math.min(dayPx, 22)),
    startDay: start,
    dueDay: due,
  };
}

function GanttBar({
  task,
  onOpen,
}: {
  task: SpanTask;
  onOpen: (task: TimelineTask) => void;
}) {
  const status = normStatus(task.status);
  const overdue = Boolean(task.overdue) && status !== "Completed";
  const innerW = Math.max(task.widthPx - 4, 12);
  const short = innerW < 64;
  const height = short ? 16 : 30;
  const color = overdue
    ? "border-danger/25 bg-danger/10 text-primary"
    : STATUS_BAR[status];

  return (
    <button
      type="button"
      title={`${task.title} · ${formatDue(task.startDay)} – ${formatDue(task.dueDay)} · ${status}`}
      onClick={() => onOpen(task)}
      className={cn(
        "absolute z-8 flex items-center overflow-hidden border transition",
        "hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        short ? "rounded-full" : "rounded-lg",
        color,
      )}
      style={{
        left: task.startPx + 2,
        width: innerW,
        height,
        top: (ROW_H - height) / 2,
      }}
    >
      {short ? (
        <span
          className={cn(
            "mx-auto size-1.5 shrink-0 rounded-full",
            overdue ? "bg-danger/70" : STATUS_DOT[status],
          )}
        />
      ) : (
        <>
          <span
            className={cn(
              "h-full w-1 shrink-0",
              overdue ? "bg-danger/60" : STATUS_RAIL[status],
            )}
          />
          <span className="min-w-0 flex-1 truncate px-2 text-left text-[11px] font-medium leading-none text-primary/80">
            {task.title}
          </span>
        </>
      )}
    </button>
  );
}

export function GanttBoard({
  items,
  filter,
  rangeStart,
  rangeEnd,
  projects,
  filterProjectId,
  onOpen,
}: {
  items: TimelineTask[];
  filter: TimelineFilter;
  rangeStart: Date;
  rangeEnd: Date;
  projects: { id: string; title: string }[];
  filterProjectId: string;
  onOpen: (task: TimelineTask) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(0);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth));
    ro.observe(el);
    setBoardW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const chartArea = Math.max(0, boardW - LEFT_W);
  const dayPx = useMemo(() => {
    if (filter === "today" || filter === "tomorrow") {
      return Math.max(280, chartArea || 280);
    }
    if (filter === "weekly") {
      return Math.max(96, Math.floor((chartArea || 672) / 7));
    }
    if (filter === "monthly") return 48;
    return 18;
  }, [filter, chartArea]);

  const { groups, ticks, chartWidth, todayLeft, todayWidth, bodyHeight } =
    useMemo(() => {
      const totalDays = Math.max(1, dayOffset(rangeEnd, rangeStart) + 1);
      const chartWidth = totalDays * dayPx;
      const ticks = buildGanttTicks(rangeStart, totalDays, dayPx, filter);
      const todayOff = dayOffset(sod(new Date()), rangeStart);
      const todayLeft =
        filter === "yearly"
          ? ticks.find((t) => t.isToday)?.left ?? null
          : todayOff >= 0 && todayOff < totalDays
            ? todayOff * dayPx
            : null;
      const todayWidth =
        filter === "yearly"
          ? (ticks.find((t) => t.isToday)?.width ?? dayPx)
          : dayPx;

      const spans = items
        .map((item) => makeGanttSpan(item, rangeStart, rangeEnd, dayPx))
        .filter((t): t is SpanTask => t !== null);

      const grouped = new Map<string, { title: string; tasks: SpanTask[] }>();
      for (const t of spans) {
        const group = grouped.get(t.projectId);
        if (group) group.tasks.push(t);
        else grouped.set(t.projectId, { title: t.project.name, tasks: [t] });
      }
      if (filterProjectId !== "all") {
        const p = projects.find((x) => x.id === filterProjectId);
        if (p && !grouped.has(p.id)) {
          grouped.set(p.id, { title: p.title, tasks: [] });
        }
      }

      const groups: ProjectGroup[] = [...grouped.entries()].map(
        ([projectId, group]) => ({
          projectId,
          title: group.title,
          tasks: group.tasks,
        }),
      );

      return {
        groups,
        ticks,
        chartWidth,
        todayLeft,
        todayWidth,
        bodyHeight: groups.reduce(
          (sum, g) => sum + GROUP_H + Math.max(g.tasks.length, 1) * ROW_H,
          0,
        ),
      };
    }, [items, rangeStart, rangeEnd, dayPx, filter, filterProjectId, projects]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [filter, items]);

  useEffect(() => {
    if (hasScrolledRef.current || !scrollRef.current) return;
    if ((filter === "monthly" || filter === "yearly") && todayLeft !== null) {
      scrollRef.current.scrollLeft = Math.max(
        0,
        todayLeft - scrollRef.current.clientWidth * 0.2,
      );
    } else {
      scrollRef.current.scrollLeft = 0;
    }
    hasScrolledRef.current = true;
  }, [chartWidth, todayLeft, filter, groups.length]);

  if (groups.length === 0) {
    return (
      <div
        ref={boardRef}
        className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm text-primary/50"
      >
        No tasks due in this window.
      </div>
    );
  }

  return (
    <div ref={boardRef} className="min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          className="sticky top-0 z-30 flex border-b border-glass bg-sidebar/95 backdrop-blur-md"
          style={{ height: HDR_H, minWidth: LEFT_W + chartWidth }}
        >
          <div
            className="sticky left-0 z-40 flex shrink-0 items-end border-r border-glass bg-sidebar px-3 pb-2 shadow-[4px_0_12px_-8px_rgba(0,0,0,0.45)]"
            style={{ width: LEFT_W }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/40">
              Task
            </span>
          </div>
          <div className="relative" style={{ width: chartWidth, height: HDR_H }}>
            {todayLeft !== null && (
              <div
                className="absolute inset-y-0 bg-accent/10"
                style={{ left: todayLeft, width: todayWidth }}
              />
            )}
            {ticks.map((tick, i) => (
              <div
                key={i}
                className={cn(
                  "absolute inset-y-0 flex flex-col items-center justify-end border-r border-glass/30 px-1 pb-1.5",
                  filter === "yearly" && "items-start px-2",
                  tick.isToday && "bg-accent/10",
                )}
                style={{ left: tick.left, width: tick.width }}
              >
                {tick.sub ? (
                  <span
                    className={cn(
                      "text-[9px] font-medium uppercase",
                      tick.isToday ? "text-accent" : "text-primary/35",
                    )}
                  >
                    {tick.sub}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "truncate text-[11px] font-semibold",
                    tick.isToday ? "text-accent" : "text-primary/55",
                  )}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minWidth: LEFT_W + chartWidth, height: bodyHeight }}>
          {groups.map((group) => (
            <div key={group.projectId}>
              <div className="flex" style={{ height: GROUP_H }}>
                <div
                  className="sticky left-0 z-20 flex items-center border-b border-r border-glass bg-sidebar px-3 shadow-[4px_0_12px_-8px_rgba(0,0,0,0.45)]"
                  style={{ width: LEFT_W }}
                >
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                    {group.title}
                  </p>
                </div>
                <div
                  className="relative border-b border-glass bg-glass-card/20"
                  style={{ width: chartWidth }}
                >
                  {todayLeft !== null && (
                    <div
                      className="absolute inset-y-0 bg-accent/10"
                      style={{ left: todayLeft, width: todayWidth }}
                    />
                  )}
                </div>
              </div>
              {(group.tasks.length === 0 ? [null] : group.tasks).map(
                (task, idx) => (
                  <div
                    key={task?.id ?? `empty-${group.projectId}`}
                    className="flex"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className={cn(
                        "sticky left-0 z-20 flex items-center border-b border-r border-glass bg-sidebar px-3 shadow-[4px_0_12px_-8px_rgba(0,0,0,0.45)]",
                        idx % 2 === 1 && "bg-[#1a1715] light:bg-[#e8e0d4]",
                      )}
                      style={{ width: LEFT_W }}
                    >
                      {task ? (
                        <button
                          type="button"
                          onClick={() => onOpen(task)}
                          className="min-w-0 w-full text-left"
                        >
                          <p className="truncate text-[13px] font-semibold text-primary">
                            {task.title}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-primary/40">
                            {formatDue(task.startDay)} – {formatDue(task.dueDay)}
                          </p>
                        </button>
                      ) : (
                        <p className="text-[11px] italic text-primary/30">
                          No tasks
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "relative border-b border-glass/40",
                        idx % 2 === 1 && "bg-glass-button/10",
                      )}
                      style={{ width: chartWidth, height: ROW_H }}
                    >
                      {ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="pointer-events-none absolute inset-y-0 border-r border-glass/20"
                          style={{ left: tick.left, width: tick.width }}
                        />
                      ))}
                      {todayLeft !== null && (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-0 bg-accent/10"
                          style={{ left: todayLeft, width: todayWidth }}
                        />
                      )}
                      {task ? <GanttBar task={task} onOpen={onOpen} /> : null}
                    </div>
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
