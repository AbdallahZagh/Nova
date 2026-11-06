import { apiClient } from "@/api/apiClient";

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
  inWarningWindow: boolean;
  previousPrice: SubscriptionPreviousPrice | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionTotals = {
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
  dueIn30Days: MoneyAmount[];
  next: DashboardUpcoming | null;
  upcoming: DashboardUpcoming[];
  alerts: DashboardUpcoming[];
};

const EMPTY_TOTALS: SubscriptionTotals = {
  dueIn30Days: [],
  yearly: [],
  activeCount: 0,
};

function normalizeTotals(
  totals: Partial<SubscriptionTotals> | null | undefined,
): SubscriptionTotals {
  if (!totals) return EMPTY_TOTALS;
  return {
    dueIn30Days: Array.isArray(totals.dueIn30Days) ? totals.dueIn30Days : [],
    yearly: Array.isArray(totals.yearly) ? totals.yearly : [],
    activeCount:
      typeof totals.activeCount === "number" && Number.isFinite(totals.activeCount)
        ? totals.activeCount
        : 0,
  };
}

export async function listSubscriptionsApi() {
  const response = await apiClient.get<SubscriptionListResponse>("/api/subscriptions");
  return {
    items: Array.isArray(response.data?.items) ? response.data.items : [],
    totals: normalizeTotals(response.data?.totals),
  };
}

export async function createSubscriptionApi(input: SubscriptionWriteInput) {
  const response = await apiClient.post<Subscription>("/api/subscriptions", input);
  return response.data;
}

export async function updateSubscriptionApi(
  id: string,
  input: SubscriptionWriteInput,
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
