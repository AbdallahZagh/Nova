import { apiClient } from "@/api/apiClient";

export type TaskCommentStatus = "OPEN" | "CLOSED";

export type TaskCommentUser = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  roleTitle?: string;
  username?: string | null;
};

export type TaskComment = {
  id: string;
  content: string;
  status: TaskCommentStatus;
  createdAt?: string;
  replyContent?: string | null;
  repliedAt?: string | null;
  closedAt?: string | null;
  createdById?: string;
  createdBy?: TaskCommentUser | null;
  repliedBy?: TaskCommentUser | null;
  closedBy?: TaskCommentUser | null;
};

type ApiTaskComment = Partial<TaskComment> & {
  task?: { id: string; title: string; projectId: string };
};

function normalizeStatus(status?: string): TaskCommentStatus {
  return status === "CLOSED" ? "CLOSED" : "OPEN";
}

function mapComment(api: ApiTaskComment): TaskComment {
  return {
    id: api.id ?? "",
    content: api.content ?? "",
    status: normalizeStatus(api.status),
    createdAt: api.createdAt,
    replyContent: api.replyContent ?? null,
    repliedAt: api.repliedAt ?? null,
    closedAt: api.closedAt ?? null,
    createdById: api.createdById,
    createdBy: api.createdBy ?? null,
    repliedBy: api.repliedBy ?? null,
    closedBy: api.closedBy ?? null,
  };
}

export async function listTaskCommentsApi(taskId: string) {
  const response = await apiClient.get<ApiTaskComment[]>(
    `/api/task-comments/task/${taskId}`,
  );
  return response.data.map(mapComment);
}

export async function createTaskCommentApi(taskId: string, content: string) {
  const response = await apiClient.post<ApiTaskComment>("/api/task-comments", {
    taskId,
    content: content.trim(),
  });
  return mapComment(response.data);
}

export async function replyTaskCommentApi(
  commentId: string,
  replyContent: string,
) {
  const response = await apiClient.patch<ApiTaskComment>(
    `/api/task-comments/${commentId}/reply`,
    { replyContent: replyContent.trim() },
  );
  return mapComment(response.data);
}

export async function closeTaskCommentApi(commentId: string) {
  const response = await apiClient.patch<ApiTaskComment>(
    `/api/task-comments/${commentId}/close`,
    {},
  );
  return mapComment(response.data);
}
