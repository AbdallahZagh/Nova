import type { Href } from "expo-router";
import type { AppNotification } from "@/api/notifications";

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
  const projectId = String(metadata?.projectId ?? "");
  const taskId = String(metadata?.taskId ?? "");
  const whiteboardId = String(metadata?.whiteboardId ?? "");

  if (
    notificationType === "WHITEBOARD_DELETED" ||
    notificationType === "WHITEBOARD_MEMBER_REMOVED"
  ) {
    return "/(main)/whiteboard";
  }
  if (notificationType.startsWith("WHITEBOARD_")) {
    return whiteboardId
      ? (`/(main)/whiteboard/${whiteboardId}` as Href)
      : "/(main)/whiteboard";
  }
  if (
    notificationType.startsWith("TASK_COMMENT") ||
    notificationType === "TASK_COMMENT_MENTION"
  ) {
    if (taskId && projectId) {
      return {
        pathname: "/(main)/task/[id]",
        params: { id: taskId, projectId },
      };
    }
    if (taskId) return `/(main)/task/${taskId}` as Href;
    if (projectId) return `/(main)/project/${projectId}` as Href;
  }
  if (
    notificationType.startsWith("PROJECT_SUGGESTION") ||
    notificationType === "PROJECT_SUGGESTION_MENTION"
  ) {
    if (projectId) return `/(main)/project/${projectId}` as Href;
  }
  return null;
}
