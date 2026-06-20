import { apiClient } from "@/api/apiClient";

export type ProjectSuggestionStatus = "In Review" | "In Progress" | "Done" | "Rejected";

export type ProjectSuggestion = {
  id: string;
  content: string;
  status: ProjectSuggestionStatus;
  createdAt?: string;
  author?: {
    id?: string;
    fullName: string;
    avatarUrl?: string | null;
    roleTitle?: string;
  };
};

type ApiSuggestion = {
  id: string;
  content?: string;
  message?: string;
  status?: string;
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
