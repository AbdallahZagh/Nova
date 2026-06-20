import { apiClient } from "@/api/apiClient";

export type SearchUser = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  roleTitle?: string;
};

type ApiSearchUser = {
  id?: string;
  userId?: string;
  fullName?: string;
  name?: string;
  email: string;
  avatarUrl?: string | null;
  roleTitle?: string;
  user?: {
    id?: string;
    fullName?: string;
    name?: string;
    email?: string;
    avatarUrl?: string | null;
    roleTitle?: string;
  };
};

export async function searchUsersApi(query: string) {
  const response = await apiClient.get<ApiSearchUser[] | { users: ApiSearchUser[] }>(
    `/api/users/search?q=${encodeURIComponent(query)}`,
  );
  const users = Array.isArray(response.data)
    ? response.data
    : (response.data.users ?? []);

  return users.reduce<SearchUser[]>((list, item) => {
    const user = item.user;
    const id = item.userId ?? user?.id ?? item.id;
    if (!id) return list;

    list.push({
      id,
      fullName:
        user?.fullName ??
        user?.name ??
        item.fullName ??
        item.name ??
        user?.email ??
        item.email,
      email: user?.email ?? item.email,
      avatarUrl: user?.avatarUrl ?? item.avatarUrl,
      roleTitle: user?.roleTitle ?? item.roleTitle,
    });

    return list;
  }, []);
}
