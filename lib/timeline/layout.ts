import type { TimelineFilter, TimelineTask } from "@/lib/api/timeline";
import type { TaskStatus } from "@/lib/tasks";

export type BoardView = "calendar" | "gantt";

export const ROW_H = 48;
export const GROUP_H = 30;
export const HDR_H = 58;
export const LEFT_W = 216;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TIME_FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "yearly", label: "This year" },
];

export const STATUS_BAR: Record<TaskStatus, string> = {
  "To Do": "border-glass bg-glass-button text-primary",
  "In Progress": "border-warning/20 bg-warning/10 text-primary",
  "In Review": "border-accent/20 bg-accent/10 text-primary",
  Completed: "border-success/20 bg-success/10 text-primary",
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  "To Do": "bg-primary/45",
  "In Progress": "bg-warning/55",
  "In Review": "bg-accent/80",
  Completed: "bg-success/55",
};

export const STATUS_RAIL: Record<TaskStatus, string> = {
  "To Do": "bg-primary/35",
  "In Progress": "bg-warning/45",
  "In Review": "bg-accent/70",
  Completed: "bg-success/45",
};

export function sod(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function eod(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function parseDay(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : sod(d);
}

export function dayOffset(date: Date, origin: Date): number {
  return Math.round((date.getTime() - origin.getTime()) / 86_400_000);
}

export function startOfWeekMonday(d: Date): Date {
  const x = sod(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarWindow(filter: TimelineFilter): { start: Date; end: Date } {
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

export function eachDay(start: Date, end: Date) {
  const days: Date[] = [];
  const cur = sod(start);
  const last = sod(end);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = startOfWeekMonday(first);
  const last = new Date(year, month + 1, 0);
  const end = new Date(startOfWeekMonday(last));
  end.setDate(end.getDate() + 6);
  return eachDay(start, end);
}

export function normStatus(raw: string): TaskStatus {
  const s = raw.trim();
  if (s === "In Progress") return "In Progress";
  if (s === "In Review") return "In Review";
  if (s === "Completed" || s === "Done") return "Completed";
  return "To Do";
}

export function formatDue(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function parseTimelineFilter(value: string | null): TimelineFilter | null {
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

export function groupByDueDay(items: TimelineTask[]) {
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

export function tipStyle(rect: DOMRect, width = 240) {
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
