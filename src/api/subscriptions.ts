import { apiClient } from "@/api/apiClient";
import { normalizeTotals } from "@/subscriptions";

export const DEMO_SUBSCRIPTION_MESSAGE =
  "The demo account cannot manage subscriptions.";

export type SubscriptionIntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type SubscriptionStatus = "ACTIVE" | "TRIAL" | "PAUSED" | "CANCELED";

export type MoneyAmount = {
  currency: string;
  amount: string;
};

export type SubscriptionPreviousPrice = {
  amount: string;
  currency: string;
  changedAt: string;
};

export type Subscription = {
  id: string;
  service: string;
  plan: string | null;
  amount: string;
  currency: string;
  intervalUnit: SubscriptionIntervalUnit;
  intervalCount: number;
  nextChargeAt: string;
  trialEndsAt: string | null;
  status: SubscriptionStatus;
  reason: string | null;
  cancelUrl: string | null;
  reminderDays: number;
  paymentLabel: string | null;
  lastCancelBy: string;
  monthlyEquivalent: string;
  yearlyCost: string;
  daysUntilCharge: number;
  overdue?: boolean;
  inWarningWindow: boolean;
  previousPrice: SubscriptionPreviousPrice | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionTotals = {
  overdueCount: number;
  monthly: MoneyAmount[];
  dueIn30Days: MoneyAmount[];
  yearly: MoneyAmount[];
  activeCount: number;
};

export type SubscriptionListResponse = {
  items: Subscription[];
  totals: SubscriptionTotals;
};

export type SubscriptionWriteInput = {
  service: string;
  amount: string;
  currency: string;
  intervalUnit: SubscriptionIntervalUnit;
  nextChargeAt: string;
  plan?: string | null;
  intervalCount?: number;
  trialEndsAt?: string | null;
  status?: SubscriptionStatus;
  reason?: string | null;
  cancelUrl?: string | null;
  reminderDays?: number;
  paymentLabel?: string | null;
};

export type DashboardUpcoming = {
  id: string;
  service: string;
  plan: string | null;
  amount: string;
  currency: string;
  nextChargeAt: string;
  trialEndsAt: string | null;
  daysUntilCharge: number;
  inWarningWindow: boolean;
  status: SubscriptionStatus;
};

export type DashboardSubscriptions = {
  overdueCount?: number;
  monthly?: MoneyAmount[];
  activeCount?: number;
  dueIn30Days: MoneyAmount[];
  next: DashboardUpcoming | null;
  upcoming: DashboardUpcoming[];
  alerts: DashboardUpcoming[];
};

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeList(data: Partial<SubscriptionListResponse> | null | undefined) {
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    totals: normalizeTotals(data?.totals),
  };
}

export async function listSubscriptionsApi() {
  const response = await apiClient.get<SubscriptionListResponse>("/api/subscriptions");
  return normalizeList(response.data);
}

export async function getSubscriptionApi(id: string) {
  const response = await apiClient.get<Subscription>(
    `/api/subscriptions/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function renewSubscriptionApi(id: string) {
  const response = await apiClient.post<Subscription>(
    `/api/subscriptions/${encodeURIComponent(id)}/renew`,
  );
  return response.data;
}

export async function renewAllSubscriptionsApi() {
  const response = await apiClient.post<
    SubscriptionListResponse & { renewed?: number }
  >("/api/subscriptions/renew-all");
  return {
    ...normalizeList(response.data),
    renewed: count(response.data?.renewed),
  };
}

export async function createSubscriptionApi(input: SubscriptionWriteInput) {
  const response = await apiClient.post<Subscription>("/api/subscriptions", input);
  return response.data;
}

export async function updateSubscriptionApi(
  id: string,
  input: Partial<SubscriptionWriteInput>,
) {
  const response = await apiClient.patch<Subscription>(
    `/api/subscriptions/${id}`,
    input,
  );
  return response.data;
}

export async function deleteSubscriptionApi(id: string) {
  await apiClient.delete<{ message: string }>(`/api/subscriptions/${id}`);
}
