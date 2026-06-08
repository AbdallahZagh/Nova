import { apiFetch } from "@/lib/api/client";
import type { ApiUser, UpdateProfilePayload } from "@/lib/api/types";

export async function getMeApi() {
  return apiFetch<ApiUser>("/api/users/me");
}

export async function getUserProfileApi(id: string) {
  return apiFetch<ApiUser>(`/api/users/${id}/profile`);
}

export async function updateMeApi(payload: UpdateProfilePayload) {
  return apiFetch<ApiUser>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type DeactivateAccountResponse = { message?: string };

/** Archives the current account; client should clear tokens after success. */
export async function deactivateMeApi() {
  return apiFetch<DeactivateAccountResponse>("/api/users/me", {
    method: "DELETE",
  });
}

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
  const data = await apiFetch<ApiSearchUser[] | { users: ApiSearchUser[] }>(
    `/api/users/search?q=${encodeURIComponent(query)}`,
  );
  const users = Array.isArray(data) ? data : (data.users ?? []);
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
