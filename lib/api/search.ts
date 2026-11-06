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

export type SearchWhiteboard = {
  id: string;
  title: string;
  projectId?: string | null;
  project?: {
    id?: string;
    name?: string;
  } | null;
};

export type SearchSubscription = {
  id: string;
  service: string;
  plan?: string | null;
  amount?: string;
  currency?: string;
  status?: string;
};

export type SearchResults = {
  projects: SearchProject[];
  tasks: SearchTask[];
  users: SearchUser[];
  whiteboards: SearchWhiteboard[];
  subscriptions: SearchSubscription[];
};

const EMPTY_SEARCH_RESULTS: SearchResults = {
  projects: [],
  tasks: [],
  users: [],
  whiteboards: [],
  subscriptions: [],
};

export async function searchApi(query: string, signal?: AbortSignal) {
  const q = query.trim();
  if (!q) return EMPTY_SEARCH_RESULTS;
  const path = process.env.NEXT_PUBLIC_API_URL ? "/search" : "/api/search";

  const data = await apiFetch<Partial<SearchResults>>(
    `${path}?q=${encodeURIComponent(q)}`,
    { signal },
  );

  return {
    projects: data.projects ?? [],
    tasks: data.tasks ?? [],
    users: data.users ?? [],
    whiteboards: data.whiteboards ?? [],
    subscriptions: data.subscriptions ?? [],
  };
}
