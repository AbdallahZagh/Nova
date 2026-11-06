import { apiFetch } from "@/lib/api/client";
import type {
  Subscription,
  SubscriptionListResponse,
  SubscriptionWriteInput,
} from "@/lib/subscriptions";

export function listSubscriptionsApi() {
  return apiFetch<SubscriptionListResponse>("/api/subscriptions");
}

export function createSubscriptionApi(input: SubscriptionWriteInput) {
  return apiFetch<Subscription>("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSubscriptionApi(id: string, input: SubscriptionWriteInput) {
  return apiFetch<Subscription>(`/api/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSubscriptionApi(id: string) {
  return apiFetch<{ message: string }>(
    `/api/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
