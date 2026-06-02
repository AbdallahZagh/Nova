import { apiFetch } from "@/lib/api/client";
import type { LoginResponse, LogoutResponse } from "@/lib/api/types";

export async function loginApi(email: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutApi() {
  return apiFetch<LogoutResponse>("/api/auth/logout", {
    method: "POST",
  });
}
