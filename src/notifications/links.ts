import type { Href } from "expo-router";
import type { AppNotification } from "@/api/notifications";

export type NotificationKind =
  | "overdue"
  | "due"
  | "mention"
  | "assigned"
  | "unassigned"
  | "done"
  | "project"
  | "whiteboard"
  | "comment"
  | "default";

export type NotificationTone = "warning" | "success" | "accent" | "muted" | "default";

const TYPE_LABELS: Record<string, string> = {
  WHITEBOARD_MEMBER_ADDED: "Added to board",
  WHITEBOARD_ROLE_CHANGED: "Role updated",
  WHITEBOARD_MEMBER_REMOVED: "Removed from board",
  WHITEBOARD_DELETED: "Board deleted",
  WHITEBOARD_COMMENT_MENTION: "Mentioned on board",
  TASK_COMMENT_MENTION: "Mentioned in comment",
  TASK_COMMENT_REPLY: "Comment reply",
  TASK_COMMENT_STATUS_CHANGED: "Comment updated",
  PROJECT_SUGGESTION_MENTION: "Mentioned in idea",
  PROJECT_SUGGESTION_CONVERTED: "Idea became a task",
  PROJECT_MEMBER_ADDED: "Added to project",
  PROJECT_TEAM_MEMBER_ADDED: "New teammate",
  PROJECT_MEMBER_REMOVED: "Removed from project",
  TASK_ASSIGNED: "Task assigned",
  TASK_UNASSIGNED: "Assignment removed",
  TASK_UPDATED: "Task updated",
  TASK_DONE: "Task completed",
  TASK_DUE_REMINDER: "Due soon",
  TASK_OVERDUE: "Task is late",
  ADMIN_SUPPORT_URGENT: "Urgent support ticket",
  ADMIN_BROADCAST: "Announcement",
  SUBTASK_ASSIGNED: "Subtask assigned",
  SUBTASK_UNASSIGNED: "Subtask unassigned",
  SUBTASK_UPDATED: "Subtask updated",
  SUBTASK_DONE: "Subtask completed",
  SUBTASK_DUE_REMINDER: "Subtask due soon",
};

export function formatNotificationType(type: string) {
  return TYPE_LABELS[type] ?? titleCaseType(type);
}

function titleCaseType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function notificationKind(type: string): NotificationKind {
  if (type === "TASK_OVERDUE") return "overdue";
  if (type.includes("DUE_REMINDER")) return "due";
  if (type.includes("MENTION")) return "mention";
  if (
    type.includes("UNASSIGNED") ||
    type.includes("REMOVED") ||
    type.includes("DELETED")
  ) {
    return "unassigned";
  }
  if (type.includes("ASSIGNED") || type.includes("MEMBER_ADDED")) return "assigned";
  if (type.includes("DONE")) return "done";
  if (type.startsWith("PROJECT_")) return "project";
  if (type.startsWith("WHITEBOARD_")) return "whiteboard";
  if (type.includes("COMMENT")) return "comment";
  return "default";
}

export function notificationTone(type: string): NotificationTone {
  switch (notificationKind(type)) {
    case "overdue":
    case "due":
      return "warning";
    case "done":
      return "success";
    case "mention":
    case "comment":
      return "accent";
    case "unassigned":
      return "muted";
    default:
      return "default";
  }
}

export function formatNotificationTime(raw?: string) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function notificationDayLabel(raw?: string) {
  if (!raw) return "Earlier";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const today = startOfLocalDay(new Date());
  const day = startOfLocalDay(date);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function groupNotificationsByDay<T extends { createdAt: string }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = notificationDayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function metaString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function hrefFromNotification(
  item: Pick<AppNotification, "type" | "metadata">,
): Href | null {
  return hrefFromNotificationData(item.type, item.metadata);
}

export function hrefFromNotificationData(
  type?: string | null,
  metadata?: Record<string, unknown> | null,
): Href | null {
  const notificationType = String(type ?? "");
  const projectId = metaString(metadata, "projectId");
  const taskId = metaString(metadata, "taskId");
  const whiteboardId = metaString(metadata, "whiteboardId");

  if (notificationType === "ADMIN_BROADCAST") {
    const url = metaString(metadata, "url");
    if (url.startsWith("/projects/")) {
      const projectId = url.split("/")[2]?.split("?")[0];
      if (projectId) return `/(main)/project/${projectId}` as Href;
    }
    if (url.startsWith("/whiteboard/")) {
      const whiteboardId = url.split("/")[2]?.split("?")[0];
      if (whiteboardId) return `/(main)/whiteboard/${whiteboardId}` as Href;
    }
    return null;
  }
  if (
    notificationType === "WHITEBOARD_DELETED" ||
    notificationType === "WHITEBOARD_MEMBER_REMOVED"
  ) {
    return "/(main)/whiteboard";
  }
  if (notificationType === "PROJECT_MEMBER_REMOVED") {
    return "/(main)/projects";
  }
  if (notificationType.startsWith("WHITEBOARD_")) {
    return whiteboardId
      ? (`/(main)/whiteboard/${whiteboardId}` as Href)
      : "/(main)/whiteboard";
  }
  if (notificationType === "PROJECT_SUGGESTION_CONVERTED" && projectId && taskId) {
    return {
      pathname: "/(main)/task/[id]",
      params: { id: taskId, projectId },
    };
  }
  if (notificationType.startsWith("PROJECT_SUGGESTION")) {
    if (projectId) {
      return {
        pathname: "/(main)/project/[id]",
        params: { id: projectId, suggestions: "1" },
      };
    }
    return null;
  }
  if (notificationType.startsWith("PROJECT_")) {
    if (projectId) return `/(main)/project/${projectId}` as Href;
    return "/(main)/projects";
  }
  if (
    notificationType.startsWith("TASK_") ||
    notificationType.startsWith("SUBTASK_") ||
    notificationType.startsWith("TASK_COMMENT")
  ) {
    if (projectId && taskId) {
      return {
        pathname: "/(main)/task/[id]",
        params: { id: taskId, projectId },
      };
    }
    if (projectId) return `/(main)/project/${projectId}` as Href;
  }
  return null;
}

export function isActionableNotification(
  item: Pick<AppNotification, "type" | "metadata">,
) {
  return Boolean(hrefFromNotification(item));
}

export function notificationActionLabel(
  item: Pick<AppNotification, "type" | "metadata">,
) {
  if (!hrefFromNotification(item)) return null;
  const type = String(item.type ?? "");
  if (type.startsWith("WHITEBOARD_")) return "Open board";
  if (type.startsWith("PROJECT_SUGGESTION")) return "Open idea";
  if (type.startsWith("PROJECT_")) return "Open project";
  if (
    type.startsWith("TASK_") ||
    type.startsWith("SUBTASK_") ||
    type.startsWith("TASK_COMMENT")
  ) {
    return "Open task";
  }
  return "Open";
}
