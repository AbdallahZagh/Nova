import { apiClient } from "@/api/apiClient";
import { apiTaskToTask, type Task } from "@/api/tasks";

export type ProjectSuggestionStatus = "In Review" | "In Progress" | "Done" | "Rejected";

export type ProjectSuggestion = {
  id: string;
  content: string;
  status: ProjectSuggestionStatus;
  authorId?: string;
  createdAt?: string;
  author?: {
    id?: string;
    fullName: string;
    avatarUrl?: string | null;
    roleTitle?: string;
  };
};

export const PROJECT_SUGGESTION_STATUS_OPTIONS: ProjectSuggestionStatus[] = [
  "In Review",
  "In Progress",
  "Done",
  "Rejected",
];

type ApiSuggestion = {
  id: string;
  content?: string;
  message?: string;
  status?: string;
  authorId?: string;
  userId?: string;
  createdAt?: string;
  author?: { id?: string; fullName?: string; name?: string; avatarUrl?: string | null; roleTitle?: string } | null;
  user?: { id?: string; fullName?: string; name?: string; avatarUrl?: string | null; roleTitle?: string } | null;
  createdBy?: { id?: string; fullName?: string; name?: string; avatarUrl?: string | null; roleTitle?: string } | null;
};

function normalizeStatus(status?: string): ProjectSuggestionStatus {
  if (status === "In Progress") return "In Progress";
  if (status === "Done") return "Done";
  if (status === "Rejected") return "Rejected";
  return "In Review";
}

function mapSuggestion(item: ApiSuggestion): ProjectSuggestion {
  const author = item.author ?? item.user ?? item.createdBy;
  return {
    id: item.id,
    content: item.content ?? item.message ?? "",
    status: normalizeStatus(item.status),
    authorId: item.authorId ?? item.userId ?? author?.id,
    createdAt: item.createdAt,
    author: author
      ? {
          id: author.id,
          fullName: author.fullName ?? author.name ?? "Unknown",
          avatarUrl: author.avatarUrl,
          roleTitle: author.roleTitle,
        }
      : undefined,
  };
}

export async function listProjectSuggestionsApi(projectId: string) {
  const response = await apiClient.get<ApiSuggestion[] | { suggestions: ApiSuggestion[] }>(
    `/api/project-suggestions/project/${projectId}`,
  );
  const list = Array.isArray(response.data)
    ? response.data
    : (response.data.suggestions ?? []);
  return list.map(mapSuggestion);
}

export async function createProjectSuggestionApi(projectId: string, content: string) {
  const response = await apiClient.post<ApiSuggestion>("/api/project-suggestions", {
    projectId,
    content: content.trim(),
  });
  return mapSuggestion(response.data);
}

export async function updateProjectSuggestionApi(
  id: string,
  patch: { content?: string; status?: ProjectSuggestionStatus },
) {
  const response = await apiClient.patch<ApiSuggestion>(`/api/project-suggestions/${id}`, {
    content: patch.content?.trim(),
    status: patch.status,
  });
  return mapSuggestion(response.data);
}

export async function deleteProjectSuggestionApi(id: string) {
  await apiClient.delete(`/api/project-suggestions/${id}`);
}

export async function convertProjectSuggestionApi(id: string) {
  const response = await apiClient.post<{
    suggestion: ApiSuggestion;
    task: Parameters<typeof apiTaskToTask>[0];
  }>(`/api/project-suggestions/${id}/convert-to-task`);
  return {
    suggestion: mapSuggestion(response.data.suggestion),
    task: apiTaskToTask(response.data.task) as Task,
  };
}
