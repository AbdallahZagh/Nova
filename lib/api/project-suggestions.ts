import { apiFetch } from "@/lib/api/client";
import { formatActivityTime } from "@/lib/tasks";

export type ProjectSuggestionStatus =
  | "In Review"
  | "In Progress"
  | "Done"
  | "Rejected";

export type ProjectSuggestionAuthor = {
  id?: string;
  fullName: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

export type ProjectSuggestion = {
  id: string;
  content: string;
  status: ProjectSuggestionStatus;
  projectId?: string;
  authorId?: string;
  author?: ProjectSuggestionAuthor;
  createdAt?: string;
  updatedAt?: string;
  createdLabel: string;
};

type ApiSuggestionAuthor = {
  id?: string;
  fullName?: string;
  name?: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

type ApiProjectSuggestion = {
  id: string;
  content?: string;
  message?: string;
  status?: string;
  projectId?: string;
  authorId?: string;
  userId?: string;
  author?: ApiSuggestionAuthor | null;
  user?: ApiSuggestionAuthor | null;
  createdBy?: ApiSuggestionAuthor | null;
  createdAt?: string;
  updatedAt?: string;
};

type CreateProjectSuggestionPayload = {
  content: string;
  projectId: string;
  status?: ProjectSuggestionStatus;
};

type UpdateProjectSuggestionPayload = {
  content?: string;
  status?: ProjectSuggestionStatus;
};

export const PROJECT_SUGGESTION_STATUS_OPTIONS = [
  { value: "In Review", label: "In Review" },
  { value: "In Progress", label: "In Progress" },
  { value: "Done", label: "Done" },
  { value: "Rejected", label: "Rejected" },
];

function normalizeStatus(raw?: string): ProjectSuggestionStatus {
  const status = raw?.trim();
  if (status === "In Progress") return "In Progress";
  if (status === "Done") return "Done";
  if (status === "Rejected") return "Rejected";
  return "In Review";
}

function mapAuthor(
  author?: ApiSuggestionAuthor | null,
): ProjectSuggestionAuthor | undefined {
  if (!author) return undefined;
  return {
    id: author.id,
    fullName: author.fullName ?? author.name ?? "Unknown",
    avatarUrl: author.avatarUrl,
    roleTitle: author.roleTitle,
  };
}

export function apiSuggestionToSuggestion(
  api: ApiProjectSuggestion,
): ProjectSuggestion {
  const createdAt = api.createdAt ?? api.updatedAt;
  return {
    id: api.id,
    content: api.content ?? api.message ?? "",
    status: normalizeStatus(api.status),
    projectId: api.projectId,
    authorId: api.authorId ?? api.userId,
    author: mapAuthor(api.author ?? api.user ?? api.createdBy),
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    createdLabel: createdAt ? formatActivityTime(createdAt) : "",
  };
}

export async function listProjectSuggestionsApi(projectId: string) {
  const data = await apiFetch<
    ApiProjectSuggestion[] | { suggestions: ApiProjectSuggestion[] }
  >(`/api/project-suggestions/project/${projectId}`);
  const list = Array.isArray(data) ? data : (data.suggestions ?? []);
  return list.map(apiSuggestionToSuggestion);
}

export async function createProjectSuggestionApi(
  projectId: string,
  content: string,
) {
  const payload: CreateProjectSuggestionPayload = {
    content: content.trim(),
    projectId,
  };
  const data = await apiFetch<ApiProjectSuggestion>("/api/project-suggestions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return apiSuggestionToSuggestion(data);
}

export async function updateProjectSuggestionApi(
  id: string,
  patch: UpdateProjectSuggestionPayload,
) {
  const data = await apiFetch<ApiProjectSuggestion>(
    `/api/project-suggestions/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content: patch.content?.trim(),
        status: patch.status,
      }),
    },
  );
  return apiSuggestionToSuggestion(data);
}

export async function deleteProjectSuggestionApi(id: string) {
  await apiFetch<void>(`/api/project-suggestions/${id}`, { method: "DELETE" });
}
