import { apiClient } from "@/api/apiClient";

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

export async function searchApi(query: string) {
  const q = query.trim();
  if (!q) return EMPTY_SEARCH_RESULTS;

  const { data } = await apiClient.get<Partial<SearchResults>>("/api/search", {
    params: { q },
  });

  return {
    projects: data.projects ?? [],
    tasks: data.tasks ?? [],
    users: data.users ?? [],
    whiteboards: data.whiteboards ?? [],
    subscriptions: data.subscriptions ?? [],
  };
}
