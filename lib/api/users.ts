import { apiFetch } from "@/lib/api/client";
import type { ApiUser, UpdateProfilePayload } from "@/lib/api/types";

export async function getMeApi() {
  return apiFetch<ApiUser>("/api/users/me");
}

export async function updateMeApi(payload: UpdateProfilePayload) {
  return apiFetch<ApiUser>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
