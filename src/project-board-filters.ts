import type { Task, TaskPriority } from "@/api/tasks";

export type BoardPersonFilter = "all" | "unassigned" | string;
export type BoardWhenFilter = "all" | "late" | "today" | "week";
export type BoardPriorityFilter = "all" | TaskPriority;

type WeekRange = { start: number; end: number };

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function taskDueDay(task: Task) {
  if (!task.dueDateIso) return null;
  const date = new Date(task.dueDateIso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function weekRange(now = new Date()): WeekRange {
  const weekday = now.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset,
  );
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.getTime(), end: end.getTime() };
}

function taskAssigneeIds(task: Task) {
  const ids = new Set<string>();
  for (const id of task.assigneeIds ?? []) {
    if (id) ids.add(id);
  }
  for (const assignee of task.assignees) {
    if (assignee.id) ids.add(assignee.id);
  }
  return ids;
}

export function taskMatchesBoardFilters(
  task: Task,
  person: BoardPersonFilter,
  when: BoardWhenFilter,
  priority: BoardPriorityFilter,
  today = startOfLocalDay(),
  week?: WeekRange,
) {
  if (priority !== "all" && task.priority !== priority) return false;

  const assigneeIds = taskAssigneeIds(task);
  if (person === "unassigned") {
    if (assigneeIds.size > 0) return false;
  } else if (person !== "all" && !assigneeIds.has(person)) {
    return false;
  }

  if (when === "all") return true;

  const dueDay = taskDueDay(task);
  if (dueDay == null) return false;

  if (when === "late") {
    return task.status !== "Completed" && dueDay < today;
  }
  if (when === "today") return dueDay === today;

  const range = week ?? weekRange();
  return dueDay >= range.start && dueDay <= range.end;
}

export function filterBoardTasks(
  tasks: Task[],
  person: BoardPersonFilter,
  when: BoardWhenFilter,
  priority: BoardPriorityFilter,
) {
  if (person === "all" && when === "all" && priority === "all") return tasks;
  const today = startOfLocalDay();
  const week = when === "week" ? weekRange() : undefined;
  return tasks.filter((task) =>
    taskMatchesBoardFilters(task, person, when, priority, today, week),
  );
}
