import { apiFetch } from "@/lib/api/client";

export async function saveDeviceTokenApi(token: string) {
  return apiFetch<{ message?: string }>("/api/device-tokens/save", {
    method: "POST",
    body: JSON.stringify({ token, platform: "web" }),
  });
}
