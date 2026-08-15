"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, GanttChart } from "lucide-react";
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
import { useTaskDrawerContext } from "@/lib/useTaskDrawerContext";

type BoardView = "calendar" | "gantt";

const ROW_H = 48;
const GROUP_H = 30;
const HDR_H = 58;
const LEFT_W = 216;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIME_FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "yearly", label: "This year" },
];

const STATUS_BAR: Record<TaskStatus, string> = {
  "To Do": "border-glass bg-glass-button text-primary",
  "In Progress": "border-warning/20 bg-warning/10 text-primary",
  "In Review": "border-accent/20 bg-accent/10 text-primary",
  Completed: "border-success/20 bg-success/10 text-primary",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  "To Do": "bg-primary/45",
  "In Progress": "bg-warning/55",
  "In Review": "bg-accent/80",
  Completed: "bg-success/55",
};

const STATUS_RAIL: Record<TaskStatus, string> = {
  "To Do": "bg-primary/35",
  "In Progress": "bg-warning/45",
  "In Review": "bg-accent/70",
  Completed: "bg-success/45",
};

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

function parseDay(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : sod(d);
}

function dayOffset(date: Date, origin: Date): number {
  return Math.round((date.getTime() - origin.getTime()) / 86_400_000);
}

function startOfWeekMonday(d: Date): Date {
  const x = sod(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
      const monday = startOfWeekMonday(today);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { start: monday, end: eod(sunday) };
    }
    case "yearly": {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { start, end: eod(end) };
    }
    case "monthly":
    default: {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start, end: eod(end) };
    }
  }
}

function eachDay(start: Date, end: Date) {
  const days: Date[] = [];
  const cur = sod(start);
  const last = sod(end);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = startOfWeekMonday(first);
  const last = new Date(year, month + 1, 0);
  const end = new Date(startOfWeekMonday(last));
  end.setDate(end.getDate() + 6);
  return eachDay(start, end);
}

function normStatus(raw: string): TaskStatus {
  const s = raw.trim();
  if (s === "In Progress") return "In Progress";
  if (s === "In Review") return "In Review";
  if (s === "Completed" || s === "Done") return "Completed";
  return "To Do";
}

function formatDue(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function parseTimelineFilter(value: string | null): TimelineFilter | null {
  if (
    value === "today" ||
    value === "tomorrow" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  ) {
    return value;
  }
  return null;
}

function groupByDueDay(items: TimelineTask[]) {
  const map = new Map<string, TimelineTask[]>();
  for (const item of items) {
    const due = parseDay(item.dueDate);
    if (!due) continue;
    const key = dateKey(due);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

type DayTip = { date: Date; tasks: TimelineTask[]; rect: DOMRect };

function tipStyle(rect: DOMRect, width = 240) {
  const cx = rect.left + rect.width / 2;
  const left = Math.max(
    width / 2 + 8,
    Math.min(cx, window.innerWidth - width / 2 - 8),
  );
  const showBelow = rect.top < 180;
  return showBelow
    ? {
        left,
        top: rect.bottom + 10,
        transform: "translate(-50%, 0)",
      }
    : {
        left,
        top: rect.top - 10,
        transform: "translate(-50%, -100%)",
      };
}

function DayTaskRow({
  task,
  onOpen,
}: {
  task: TimelineTask;
  onOpen: (task: TimelineTask) => void;
}) {
  const status = normStatus(task.status);
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="block w-full rounded-lg px-2 py-2 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <p className="text-xs font-semibold leading-snug text-primary">{task.title}</p>
      <p className="mt-0.5 text-[10px] text-primary/50">{task.project.name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
        <span className="text-[10px] font-medium text-primary/55">{status}</span>
        {task.overdue && status !== "Completed" ? (
          <span className="text-[10px] font-semibold text-danger">Overdue</span>
        ) : null}
      </div>
    </button>
  );
}

function DayTooltip({
  tip,
  interactive,
  onOpen,
  onClose,
}: {
  tip: DayTip;
  interactive?: boolean;
  onOpen: (task: TimelineTask) => void;
  onClose?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interactive) return;
    const onDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [interactive, onClose]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-300 w-60 rounded-xl border border-glass bg-sidebar px-2 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-2xl",
        !interactive && "pointer-events-none",
      )}
      style={tipStyle(tip.rect)}
    >
      <p className="px-2 text-[11px] font-semibold text-primary/50">
        {formatDayLabel(tip.date)}
      </p>
      {tip.tasks.length === 0 ? (
        <p className="mt-1 px-2 text-[11px] text-primary/35">No tasks</p>
      ) : interactive ? (
        <div className="mt-1">
          {tip.tasks.map((task) => (
            <DayTaskRow key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2 px-2">
          {tip.tasks.map((task) => (
            <div key={task.id}>
              <p className="text-xs font-semibold leading-snug text-primary">
                {task.title}
              </p>
              <p className="mt-0.5 text-[10px] text-primary/50">
                {task.project.name} · {normStatus(task.status)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarCell({
  date,
  tasks,
  inMonth = true,
  compact,
  selected,
  onHover,
  onLeave,
  onSelect,
}: {
  date: Date;
  tasks: TimelineTask[];
  inMonth?: boolean;
  compact?: boolean;
  selected?: boolean;
  onHover: (tip: DayTip) => void;
  onLeave: () => void;
  onSelect: (tip: DayTip) => void;
}) {
  const isToday = dayOffset(date, sod(new Date())) === 0;
  const count = tasks.length;

  const emit = (event: React.MouseEvent, fn: (tip: DayTip) => void) => {
    if (!inMonth) return;
    fn({
      date,
      tasks,
      rect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
    });
  };

  return (
    <button
      type="button"
      disabled={!inMonth}
      onMouseEnter={(e) => emit(e, onHover)}
      onMouseLeave={onLeave}
      onClick={(e) => emit(e, onSelect)}
      aria-label={`${formatDayLabel(date)}${count ? `, ${count} tasks` : ""}`}
      className={cn(
        "flex flex-col border-r border-b border-glass/70 p-1.5 text-left transition",
        compact ? "min-h-16" : "min-h-20",
        inMonth ? "hover:bg-glass-button/60" : "pointer-events-none opacity-35",
        isToday && "bg-accent/10",
        selected && "ring-1 ring-inset ring-accent/70",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-accent" : "text-primary/70",
          )}
        >
          {date.getDate()}
        </span>
        {count > 0 ? (
          <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent">
            {count}
          </span>
        ) : null}
      </div>
      {count > 0 ? (
        <div className="mt-auto flex gap-0.5 pt-2">
          {tasks.slice(0, 3).map((task) => (
            <span
              key={task.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                STATUS_DOT[normStatus(task.status)],
              )}
            />
          ))}
        </div>
      ) : (
        <span className="mt-auto" />
      )}
    </button>
  );
}

function CalendarBoard({
  items,
  filter,
  rangeStart,
  rangeEnd,
  onOpen,
}: {
  items: TimelineTask[];
  filter: TimelineFilter;
  rangeStart: Date;
  rangeEnd: Date;
  onOpen: (task: TimelineTask) => void;
}) {
  const byDay = useMemo(() => groupByDueDay(items), [items]);
  const [hover, setHover] = useState<DayTip | null>(null);
  const [pinned, setPinned] = useState<DayTip | null>(null);

  const handleSelect = useCallback(
    (tip: DayTip) => {
      setHover(null);
      if (tip.tasks.length === 1) {
        setPinned(null);
        onOpen(tip.tasks[0]);
        return;
      }
      if (tip.tasks.length > 1) {
        setPinned(tip);
        return;
      }
      setPinned(null);
    },
    [onOpen],
  );

  const openFromPin = useCallback(
    (task: TimelineTask) => {
      setPinned(null);
      onOpen(task);
    },
    [onOpen],
  );

  const preview = pinned ? null : hover;

  if (filter === "today" || filter === "tomorrow") {
    const day = rangeStart;
    const tasks = byDay.get(dateKey(day)) ?? [];
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/45">
          {formatDayLabel(day)}
        </p>
        {tasks.length === 0 ? (
          <p className="mt-6 text-sm text-primary/45">No tasks due this day.</p>
        ) : (
          <div className="mt-3 max-w-xl space-y-1 rounded-xl border border-glass bg-glass-card/40 p-2">
            {tasks.map((task) => (
              <DayTaskRow key={task.id} task={task} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (filter === "yearly") {
    const year = rangeStart.getFullYear();
    return (
      <div className="relative min-h-0 flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, month) => {
            const cells = monthGrid(year, month);
            const label = new Date(year, month, 1).toLocaleDateString("en-US", {
              month: "long",
            });
            return (
              <div
                key={month}
                className="overflow-hidden rounded-xl border border-glass bg-glass-card/40"
              >
                <p className="border-b border-glass px-3 py-2 text-sm font-semibold text-primary">
                  {label}
                </p>
                <div className="grid grid-cols-7 px-1.5 pt-2 text-center text-[10px] font-medium uppercase text-primary/35">
                  {WEEKDAYS.map((d) => (
                    <span key={d}>{d.slice(0, 2)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 p-1.5">
                  {cells.map((date) => (
                    <CalendarCell
                      key={dateKey(date)}
                      date={date}
                      tasks={
                        date.getMonth() === month
                          ? (byDay.get(dateKey(date)) ?? [])
                          : []
                      }
                      inMonth={date.getMonth() === month}
                      compact
                      selected={
                        pinned
                          ? dateKey(pinned.date) === dateKey(date)
                          : false
                      }
                      onHover={setHover}
                      onLeave={() => setHover(null)}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {preview && preview.tasks.length > 0 ? (
          <DayTooltip tip={preview} onOpen={onOpen} />
        ) : null}
        {pinned ? (
          <DayTooltip
            tip={pinned}
            interactive
            onOpen={openFromPin}
            onClose={() => setPinned(null)}
          />
        ) : null}
      </div>
    );
  }

  const days =
    filter === "monthly"
      ? monthGrid(rangeStart.getFullYear(), rangeStart.getMonth())
      : eachDay(rangeStart, rangeEnd);
  const month = rangeStart.getMonth();
  const cols = 7;

  return (
    <div className="relative min-h-0 flex-1 overflow-auto p-3">
      <div className="overflow-hidden rounded-xl border border-glass">
        <div
          className="grid border-b border-glass bg-glass-card/50"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-r border-glass/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-primary/45 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {days.map((date) => (
            <CalendarCell
              key={dateKey(date)}
              date={date}
              tasks={byDay.get(dateKey(date)) ?? []}
              inMonth={filter === "monthly" ? date.getMonth() === month : true}
              selected={pinned ? dateKey(pinned.date) === dateKey(date) : false}
              onHover={setHover}
              onLeave={() => setHover(null)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
      {preview && (preview.tasks.length > 0 || filter === "weekly") ? (
        <DayTooltip tip={preview} onOpen={onOpen} />
      ) : null}
      {pinned ? (
        <DayTooltip
          tip={pinned}
          interactive
          onOpen={openFromPin}
          onClose={() => setPinned(null)}
        />
      ) : null}
    </div>
  );
}

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

function GanttBoard({
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

      const seen = new Set<string>();
      const order: [string, string][] = [];
      for (const t of spans) {
        if (!seen.has(t.projectId)) {
          seen.add(t.projectId);
          order.push([t.projectId, t.project.name]);
        }
      }
      if (filterProjectId !== "all") {
        const p = projects.find((x) => x.id === filterProjectId);
        if (p && !seen.has(p.id)) order.push([p.id, p.title]);
      }

      const groups: ProjectGroup[] = order.map(([projectId, title]) => ({
        projectId,
        title,
        tasks: spans.filter((t) => t.projectId === projectId),
      }));

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

function TimelinePage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { projects, projectsLoading, updateTask, deleteTask } = useAppData();

  const [view, setView] = useState<BoardView>(
    () => (searchParams.get("view") === "gantt" ? "gantt" : "calendar"),
  );
  const [timeFilter, setTimeFilter] = useState<TimelineFilter>(
    () => parseTimelineFilter(searchParams.get("filter")) ?? "monthly",
  );
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [timelineItems, setTimelineItems] = useState<TimelineTask[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

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

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const items = await getTimelineApi({
        filter: timeFilter,
        ...(filterProjectId !== "all" ? { projectId: filterProjectId } : {}),
      });
      setTimelineItems(items);
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

  const { start: rangeStart, end: rangeEnd } = calendarWindow(timeFilter);
  const windowLabel =
    timelineItems[0]?.windowLabel ??
    TIME_FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label ??
    "Timeline";

  const openTask = useCallback(
    async (item: TimelineTask) => {
      setSelectedTaskId(item.id);
      setSelectedTaskProjectId(item.project.id);
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

  const rangeCaption = `${rangeStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${rangeEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-primary/55">
            {windowLabel} · {rangeCaption} · {timelineItems.length} task
            {timelineItems.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-glass bg-glass-button/50 p-1">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "calendar"
                ? "bg-accent text-white shadow-sm"
                : "text-primary/60 hover:text-primary",
            )}
          >
            <CalendarDays className="size-3.5" />
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setView("gantt")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "gantt"
                ? "bg-accent text-white shadow-sm"
                : "text-primary/60 hover:text-primary",
            )}
          >
            <GanttChart className="size-3.5" />
            Gantt
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-glass bg-sidebar shadow-sm">
        <div className="flex shrink-0 flex-col gap-3 border-b border-glass px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-glass bg-glass-button/50 p-1">
            {TIME_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTimeFilter(option.value)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  timeFilter === option.value
                    ? "bg-accent text-white shadow-sm"
                    : "text-primary/60 hover:bg-glass-button hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={filterProjectId}
              onChange={setFilterProjectId}
              options={projectOptions}
              variant="glass"
              aria-label="Filter by project"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-glass px-4 py-2">
          {(["To Do", "In Progress", "In Review", "Completed"] as TaskStatus[]).map(
            (s) => (
              <div
                key={s}
                className="flex items-center gap-1.5 text-[11px] text-primary/65"
              >
                <div className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                {s}
              </div>
            ),
          )}
          <p className="w-full text-[11px] text-primary/40 sm:ml-auto sm:w-auto">
            {view === "calendar"
              ? "Hover a day to preview. Click one task to open it, or click a busy day to pick from the list."
              : "Bars run from created date to due date. Hover a short bar to see the title."}
          </p>
        </div>

        {view === "calendar" ? (
          <CalendarBoard
            items={timelineItems}
            filter={timeFilter}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onOpen={openTask}
          />
        ) : (
          <GanttBoard
            items={timelineItems}
            filter={timeFilter}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            projects={projects}
            filterProjectId={filterProjectId}
            onOpen={openTask}
          />
        )}
      </div>

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

export default function TimelinePageRoute() {
  return (
    <Suspense fallback={<TimelineSkeleton />}>
      <TimelinePage />
    </Suspense>
  );
}
