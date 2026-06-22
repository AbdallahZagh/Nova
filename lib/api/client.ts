import axios, { isAxiosError, type AxiosRequestConfig, type Method } from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const ACCESS_TOKEN_KEY = "taskflow-access-token";

export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return normalizedPath;
  return `${API_BASE.replace(/\/$/, "")}${normalizedPath}`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures so auth flows can still surface API errors.
  }
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Ignore storage failures during logout.
  }
}

function redirectToLoginForExpiredSession() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/") return;

  clearAccessToken();
  const loginUrl = new URL("/", window.location.origin);
  loginUrl.searchParams.set(
    "from",
    `${window.location.pathname}${window.location.search}`,
  );
  loginUrl.searchParams.set("reason", "session_expired");
  window.location.assign(loginUrl.toString());
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function getApiErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "object" && payload && "message" in payload) {
    const message = (payload as { message: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : String(message);
  }

  if (typeof payload === "object" && payload && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }

  return `Request failed with status ${status}`;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers: providedHeaders, body, ...rest } = options;
  const headers = new Headers(providedHeaders);

  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const config: AxiosRequestConfig = {
    url: apiUrl(path),
    method: (rest.method ?? "GET") as Method,
    headers: headersToObject(headers),
    data: body,
    signal: rest.signal ?? undefined,
    validateStatus: () => true,
  };

  try {
    const response = await axios.request<T>(config);

    if (response.status < 200 || response.status >= 300) {
      if (auth && response.status === 401) {
        redirectToLoginForExpiredSession();
      }

      throw new ApiError(
        getApiErrorMessage(response.data, response.status),
        response.status,
        response.data,
      );
    }

    return response.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      if (auth && status === 401) {
        redirectToLoginForExpiredSession();
      }
      throw new ApiError(
        getApiErrorMessage(error.response?.data, status || 500),
        status || 500,
        error.response?.data,
      );
    }

    throw error;
  }
}
