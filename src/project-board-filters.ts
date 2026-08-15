import type { Task, TaskPriority } from "@/api/tasks";

export type BoardPersonFilter = "all" | "unassigned" | string;
export type BoardWhenFilter = "all" | "late" | "today" | "week";
export type BoardPriorityFilter = "all" | TaskPriority;

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function taskDueDay(task: Task) {
  if (!task.dueDateIso) return null;
  const date = new Date(task.dueDateIso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function weekRange(now = new Date()) {
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
  const ids = [
    ...(task.assigneeIds ?? []),
    ...task.assignees.map((assignee) => assignee.id ?? ""),
  ].filter(Boolean);
  return [...new Set(ids)];
}

export function taskMatchesBoardFilters(
  task: Task,
  person: BoardPersonFilter,
  when: BoardWhenFilter,
  priority: BoardPriorityFilter,
) {
  if (priority !== "all" && task.priority !== priority) return false;

  const assigneeIds = taskAssigneeIds(task);
  if (person === "unassigned") {
    if (assigneeIds.length > 0) return false;
  } else if (person !== "all" && !assigneeIds.includes(person)) {
    return false;
  }

  if (when === "all") return true;

  const dueDay = taskDueDay(task);
  if (dueDay == null) return false;

  const today = startOfLocalDay();
  if (when === "late") {
    return task.status !== "Completed" && dueDay < today;
  }
  if (when === "today") return dueDay === today;

  const { start, end } = weekRange();
  return dueDay >= start && dueDay <= end;
}

export function filterBoardTasks(
  tasks: Task[],
  person: BoardPersonFilter,
  when: BoardWhenFilter,
  priority: BoardPriorityFilter,
) {
  if (person === "all" && when === "all" && priority === "all") return tasks;
  return tasks.filter((task) =>
    taskMatchesBoardFilters(task, person, when, priority),
  );
}
