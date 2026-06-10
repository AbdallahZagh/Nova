import { apiFetch } from "@/lib/api/client";

export type SearchProject = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
};

export type SearchTask = {
  id: string;
  title: string;
  projectId?: string;
  project?: {
    id?: string;
    name?: string;
  } | null;
};

export type SearchUser = {
  id: string;
  name?: string;
  fullName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
};

export type SearchResults = {
  projects: SearchProject[];
  tasks: SearchTask[];
  users: SearchUser[];
};

export async function searchApi(query: string, signal?: AbortSignal) {
  const q = query.trim();
  if (!q) return { projects: [], tasks: [], users: [] };
  const path = process.env.NEXT_PUBLIC_API_URL ? "/search" : "/api/search";

  const data = await apiFetch<Partial<SearchResults>>(
    `${path}?q=${encodeURIComponent(q)}`,
    { signal },
  );

  return {
    projects: data.projects ?? [],
    tasks: data.tasks ?? [],
    users: data.users ?? [],
  };
}
