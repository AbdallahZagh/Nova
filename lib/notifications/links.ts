import type { AppNotification } from "@/lib/api/notifications";

const TYPE_LABELS: Record<string, string> = {
  WHITEBOARD_MEMBER_ADDED: "Added to board",
  WHITEBOARD_ROLE_CHANGED: "Role updated",
  WHITEBOARD_MEMBER_REMOVED: "Removed from board",
  WHITEBOARD_DELETED: "Board deleted",
  WHITEBOARD_COMMENT_MENTION: "Mentioned on board",
  TASK_COMMENT_MENTION: "Mentioned in comment",
  PROJECT_SUGGESTION_MENTION: "Mentioned in suggestion",
};

export function formatNotificationType(type: string) {
  return TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

export function hrefFromNotification(item: AppNotification) {
  const type = item.type;
  const metadata = item.metadata ?? {};
  const url = typeof metadata.url === "string" ? metadata.url : "";

  if (type === "WHITEBOARD_DELETED" || type === "WHITEBOARD_MEMBER_REMOVED") {
    return "/whiteboard";
  }
  if (type.startsWith("WHITEBOARD_")) {
    const whiteboardId = String(metadata.whiteboardId ?? "");
    return whiteboardId ? `/whiteboard/${whiteboardId}` : "/whiteboard";
  }
  if (type.startsWith("TASK_COMMENT") || type === "TASK_COMMENT_MENTION") {
    const projectId = String(metadata.projectId ?? "");
    const taskId = String(metadata.taskId ?? "");
    if (projectId && taskId) return `/projects/${projectId}?task=${taskId}`;
    if (url) return url;
  }
  if (type.startsWith("PROJECT_SUGGESTION") || type === "PROJECT_SUGGESTION_MENTION") {
    const projectId = String(metadata.projectId ?? "");
    if (projectId) return `/projects/${projectId}`;
    if (url) return url;
  }
  return url || null;
}
