import { create, isAxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { router } from "expo-router";
import {
  enqueueMutation,
  flushOfflineQueue,
  isNetworkFailure,
  optimisticMutationResponse,
  readCachedGet,
  shouldBypassOffline,
  useOfflineStore,
  writeCachedGet,
} from "@/offline/store";
import { expoFetchAdapter } from "@/api/expoFetchAdapter";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://nova-l5df.onrender.com"
).replace(/\/$/, "");

type OfflineConfig = AxiosRequestConfig & {
  skipOfflineQueue?: boolean;
  fromOfflineCache?: boolean;
};

function createBaseClient() {
  return create({
    baseURL: API_BASE_URL,
    timeout: 30_000,
    adapter: expoFetchAdapter,
    headers: {
      Accept: "application/json",
    },
    transitional: {
      clarifyTimeoutError: true,
    },
  });
}

export const apiClient = createBaseClient();
export const publicApiClient = createBaseClient();

function skipped(config?: AxiosRequestConfig) {
  return Boolean((config as OfflineConfig | undefined)?.skipOfflineQueue);
}

function fromCache(config?: AxiosRequestConfig) {
  return Boolean((config as OfflineConfig | undefined)?.fromOfflineCache);
}

function stripUnsafeHeaders(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? "get").toUpperCase();
  const headers = config.headers;
  if (!headers) return config;

  headers.delete?.("User-Agent");
  headers.delete?.("user-agent");
  if (method === "GET" || method === "HEAD") {
    headers.delete?.("Content-Type");
    headers.delete?.("content-type");
    config.data = undefined;
  }
  return config;
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return stripUnsafeHeaders(config);
});

publicApiClient.interceptors.request.use(stripUnsafeHeaders);

let handlingUnauthorized = false;
let failureWave = 0;
let lastFailureAt = 0;

function fakeOk(config: InternalAxiosRequestConfig | undefined, data: unknown) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {
      ...(config ?? ({} as InternalAxiosRequestConfig)),
      fromOfflineCache: true,
    } as InternalAxiosRequestConfig,
  };
}

function markOnline() {
  failureWave = 0;
  lastFailureAt = 0;
  useOfflineStore.getState().setOnline(true);
}

function recordNetworkFailure() {
  const now = Date.now();
  if (now - lastFailureAt > 2500) {
    failureWave += 1;
  }
  lastFailureAt = now;
  if (failureWave >= 2) {
    useOfflineStore.getState().setOnline(false);
  }
}

export async function syncOfflineQueue() {
  await flushOfflineQueue(async (item) => {
    await apiClient.request({
      method: item.method,
      url: item.path,
      data: item.body,
      skipOfflineQueue: true,
    } as OfflineConfig);
  });
}

export async function probeApiHealth() {
  try {
    await publicApiClient.get("/api/health", { timeout: 10_000 });
    markOnline();
    void syncOfflineQueue();
    return true;
  } catch {
    return false;
  }
}

apiClient.interceptors.response.use(
  (response) => {
    if (fromCache(response.config)) {
      return response;
    }
    markOnline();
    if ((response.config.method ?? "get").toUpperCase() === "GET" && response.config.url) {
      void writeCachedGet(response.config.url, response.data);
    }
    if (!skipped(response.config)) {
      void syncOfflineQueue();
    }
    return response;
  },
  async (error: unknown) => {
    const axiosError = isAxiosError(error) ? error : null;
    if (axiosError?.response?.status === 401 && !handlingUnauthorized) {
      handlingUnauthorized = true;
      await useAuthStore.getState().clearSession();
      useSnackbarStore.getState().showSnackbar({
        variant: "warning",
        title: "Session expired",
        message: "Your token expired. Please log in again.",
      });
      router.replace({
        pathname: "/(auth)/login",
        params: { reason: "session_expired" },
      });
      setTimeout(() => {
        handlingUnauthorized = false;
      }, 500);
    }

    const config = axiosError?.config;
    const method = (config?.method ?? "get").toUpperCase();
    const url = config?.url ?? "";
    if (
      isNetworkFailure(error) &&
      config &&
      !skipped(config) &&
      !shouldBypassOffline(url, config.data)
    ) {
      recordNetworkFailure();
      if (method === "GET") {
        const cached = await readCachedGet(url);
        if (cached !== null) return fakeOk(config, cached);
      } else if (!useOfflineStore.getState().online) {
        await enqueueMutation({ method, path: url, body: config.data });
        const data = await optimisticMutationResponse(method, url, config.data);
        return fakeOk(config, data);
      }
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  const payload = error.response?.data as
    | { message?: string | string[]; error?: string }
    | undefined;
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  return payload?.message ?? payload?.error ?? fallback;
}

export function isInactiveAccountError(error: unknown) {
  if (!isAxiosError(error)) return false;
  const message = getApiErrorMessage(error, "").toLowerCase();
  return (
    message.includes("inactive") ||
    message.includes("archived") ||
    message.includes("archive") ||
    message.includes("reactivat") ||
    message.includes("deactivated") ||
    message.includes("account is not active")
  );
}
