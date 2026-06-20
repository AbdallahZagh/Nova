import { AxiosError, create, isAxiosError } from "axios";
import { router } from "expo-router";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

export const API_BASE_URL = "https://nova-l5df.onrender.com";

function createBaseClient() {
  return create({
    baseURL: API_BASE_URL,
    timeout: 20_000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

export const apiClient = createBaseClient();
export const publicApiClient = createBaseClient();

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let handlingUnauthorized = false;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && !handlingUnauthorized) {
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
