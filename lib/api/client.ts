import type { ApiErrorBody } from "@/lib/api/types";

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

/** Read the active Supabase session token — works client-side only. */
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** @deprecated Supabase manages its own session — kept for backward compatibility. */
export function setAccessToken(_token: string): void {}

/** @deprecated Supabase manages its own session — kept for backward compatibility. */
export function clearAccessToken(): void {}

/** Legacy key — no longer used; kept so existing imports don't break. */
export const ACCESS_TOKEN_KEY = "taskflow-access-token";

function parseErrorMessage(status: number, body: ApiErrorBody): string {
  if (body.message) return body.message;
  if (body.error) return body.error;
  if (body.errors) {
    const first = Object.values(body.errors).flat()[0];
    if (first) return first;
  }
  if (status === 401) return "Unauthorized. Please sign in again.";
  if (status === 400) return "Invalid request. Please check your input.";
  if (status === 404) return "Resource not found.";
  return `Request failed (${status})`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);

  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = await getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(apiUrl(path), { ...rest, headers });
  const text = await res.text();
  let body: ApiErrorBody = {};
  if (text) {
    try {
      body = JSON.parse(text) as ApiErrorBody;
    } catch {
      body = { message: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, parseErrorMessage(res.status, body), body);
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
