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

export type DeactivateAccountResponse = { message?: string };

/** Archives the current account; client should clear tokens after success. */
export async function deactivateMeApi() {
  return apiFetch<DeactivateAccountResponse>("/api/users/me", {
    method: "DELETE",
  });
}
