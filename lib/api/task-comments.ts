import { apiFetch } from "@/lib/api/client";
import { formatActivityTime } from "@/lib/tasks";

export type TaskCommentStatus = "OPEN" | "CLOSED";

export type TaskCommentUser = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type TaskComment = {
  id: string;
  content: string;
  status: TaskCommentStatus;
  createdAt?: string;
  updatedAt?: string;
  replyContent?: string | null;
  repliedAt?: string | null;
  closedAt?: string | null;
  taskId?: string;
  createdById?: string;
  repliedById?: string | null;
  closedById?: string | null;
  createdBy?: TaskCommentUser | null;
  repliedBy?: TaskCommentUser | null;
  closedBy?: TaskCommentUser | null;
  createdLabel: string;
  repliedLabel: string;
  closedLabel: string;
};

type ApiTaskComment = Partial<TaskComment> & {
  task?: { id: string; title: string; projectId: string };
};

function normalizeStatus(status?: string): TaskCommentStatus {
  return status === "CLOSED" ? "CLOSED" : "OPEN";
}

export function apiTaskCommentToComment(api: ApiTaskComment): TaskComment {
  return {
    id: api.id ?? "",
    content: api.content ?? "",
    status: normalizeStatus(api.status),
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    replyContent: api.replyContent ?? null,
    repliedAt: api.repliedAt ?? null,
    closedAt: api.closedAt ?? null,
    taskId: api.taskId ?? api.task?.id,
    createdById: api.createdById,
    repliedById: api.repliedById ?? null,
    closedById: api.closedById ?? null,
    createdBy: api.createdBy ?? null,
    repliedBy: api.repliedBy ?? null,
    closedBy: api.closedBy ?? null,
    createdLabel: api.createdAt ? formatActivityTime(api.createdAt) : "",
    repliedLabel: api.repliedAt ? formatActivityTime(api.repliedAt) : "",
    closedLabel: api.closedAt ? formatActivityTime(api.closedAt) : "",
  };
}

export async function listTaskCommentsApi(taskId: string) {
  const data = await apiFetch<ApiTaskComment[]>(`/api/task-comments/task/${taskId}`);
  return data.map(apiTaskCommentToComment);
}

export async function createTaskCommentApi(taskId: string, content: string) {
  const data = await apiFetch<ApiTaskComment>("/api/task-comments", {
    method: "POST",
    body: JSON.stringify({ taskId, content: content.trim() }),
  });
  return apiTaskCommentToComment(data);
}

export async function replyTaskCommentApi(
  commentId: string,
  replyContent: string,
) {
  const data = await apiFetch<ApiTaskComment>(
    `/api/task-comments/${commentId}/reply`,
    {
      method: "PATCH",
      body: JSON.stringify({ replyContent: replyContent.trim() }),
    },
  );
  return apiTaskCommentToComment(data);
}

export async function closeTaskCommentApi(commentId: string) {
  const data = await apiFetch<ApiTaskComment>(
    `/api/task-comments/${commentId}/close`,
    { method: "PATCH", body: JSON.stringify({}) },
  );
  return apiTaskCommentToComment(data);
}
