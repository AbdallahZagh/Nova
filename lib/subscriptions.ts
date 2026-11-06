export type SubscriptionIntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

export type SubscriptionStatus = "ACTIVE" | "TRIAL" | "PAUSED" | "CANCELED";

export type MoneyTotal = {
  currency: string;
  amount: string;
};

export type SubscriptionPriceChange = {
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
  previousPrice: SubscriptionPriceChange | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionTotals = {
  dueIn30Days: MoneyTotal[];
  yearly: MoneyTotal[];
  activeCount: number;
};

export type SubscriptionListResponse = {
  items: Subscription[];
  totals: SubscriptionTotals;
};

export type SubscriptionWriteInput = {
  service: string;
  plan?: string | null;
  amount: string;
  currency: string;
  intervalUnit: SubscriptionIntervalUnit;
  intervalCount?: number;
  nextChargeAt: string;
  trialEndsAt?: string | null;
  status?: SubscriptionStatus;
  reason?: string | null;
  cancelUrl?: string | null;
  reminderDays?: number;
  paymentLabel?: string | null;
};

export type DashboardUpcomingSubscription = {
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

export type DashboardSubscriptionNext = {
  service: string;
  daysUntilCharge: number;
};

export type DashboardSubscriptionAlert = {
  id: string;
  service: string;
  daysUntilCharge: number;
  trialEndsAt?: string | null;
  status?: string | null;
};

export type DashboardSubscriptions = {
  dueIn30Days: MoneyTotal[];
  next: DashboardSubscriptionNext | null;
  upcoming: DashboardUpcomingSubscription[];
  alerts: DashboardSubscriptionAlert[];
};

export const EMPTY_SUBSCRIPTION_TOTALS: SubscriptionTotals = {
  dueIn30Days: [],
  yearly: [],
  activeCount: 0,
};

export const EMPTY_DASHBOARD_SUBSCRIPTIONS: DashboardSubscriptions = {
  dueIn30Days: [],
  next: null,
  upcoming: [],
  alerts: [],
};

export type MoneyListDisplay = {
  value: string;
  rest: string | null;
};

export function formatMoney(amount: string | number, currency: string): string {
  const raw = amount == null ? "" : String(amount).trim();
  const code = String(currency ?? "")
    .trim()
    .toUpperCase();
  const numeric = typeof amount === "number" ? amount : Number(raw);
  const fallback = [raw, code].filter(Boolean).join(" ");

  if (raw === "" || !Number.isFinite(numeric) || !/^[A-Z]{3}$/.test(code)) {
    return fallback;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(numeric);
  } catch {
    return fallback;
  }
}

export function formatMoneyList(
  entries: MoneyTotal[] | null | undefined,
): MoneyListDisplay {
  const usable = (entries ?? []).filter(
    (entry) =>
      entry &&
      String(entry.currency ?? "").trim() &&
      entry.amount != null &&
      String(entry.amount).trim() !== "",
  );

  if (usable.length === 0) return { value: "—", rest: null };

  const [first, ...rest] = usable;
  return {
    value: formatMoney(first.amount, first.currency),
    rest: rest.length
      ? rest.map((entry) => formatMoney(entry.amount, entry.currency)).join(" · ")
      : null,
  };
}

export function daysLabel(days: number): string {
  if (!Number.isFinite(days) || days < 1) return "today";
  const count = Math.floor(days);
  if (count <= 1) return "in 1 day";
  return `in ${count} days`;
}

export function chargeTimingLabel(service: string, days: number): string {
  const name = service.trim();
  const timing = daysLabel(days);
  return name ? `${name} · ${timing}` : timing;
}

export function subscriptionAlertLabel(alert: {
  daysUntilCharge?: number | null;
  status?: string | null;
  trialEndsAt?: string | null;
}): string {
  const days = Number(alert.daysUntilCharge);
  if (!Number.isFinite(days) || days < 1) return "today";
  const count = Math.floor(days);
  const unit = count === 1 ? "day" : "days";
  const trial =
    alert.status === "TRIAL" ||
    (alert.status == null && Boolean(alert.trialEndsAt));
  return trial ? `Trial ends in ${count} ${unit}` : `Renews in ${count} ${unit}`;
}

export function formatChargeDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = parseChargeDate(value);
  if (!date) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = parseChargeDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export function subscriptionHref(id: string): string {
  return `/subscriptions?id=${encodeURIComponent(id)}`;
}

export function normalizeSubscriptionList(
  data: Partial<SubscriptionListResponse> | null | undefined,
): SubscriptionListResponse {
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    totals: {
      dueIn30Days: asMoneyTotals(data?.totals?.dueIn30Days),
      yearly: asMoneyTotals(data?.totals?.yearly),
      activeCount:
        typeof data?.totals?.activeCount === "number" &&
        Number.isFinite(data.totals.activeCount)
          ? data.totals.activeCount
          : 0,
    },
  };
}

export function normalizeDashboardSubscriptions(
  value: Partial<DashboardSubscriptions> | null | undefined,
): DashboardSubscriptions {
  if (!value || typeof value !== "object") return EMPTY_DASHBOARD_SUBSCRIPTIONS;

  const next = asDashboardNext(value.next);
  const upcoming = Array.isArray(value.upcoming)
    ? value.upcoming.filter(isUpcoming).slice(0, 3)
    : [];
  const alerts = Array.isArray(value.alerts) ? value.alerts.filter(isAlert) : [];

  return {
    dueIn30Days: asMoneyTotals(value.dueIn30Days),
    next,
    upcoming,
    alerts,
  };
}

function parseChargeDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const date = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asMoneyTotals(value: MoneyTotal[] | null | undefined): MoneyTotal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const currency = typeof entry.currency === "string" ? entry.currency : "";
    if (!currency.trim() || entry.amount == null) return [];
    return [{ currency, amount: String(entry.amount) }];
  });
}

function asDashboardNext(
  value: DashboardSubscriptionNext | null | undefined,
): DashboardSubscriptionNext | null {
  if (!value || typeof value !== "object") return null;
  if (typeof value.service !== "string" || !value.service.trim()) return null;
  const days = Number(value.daysUntilCharge);
  return {
    service: value.service,
    daysUntilCharge: Number.isFinite(days) ? days : 0,
  };
}

function isUpcoming(
  value: DashboardUpcomingSubscription | null | undefined,
): value is DashboardUpcomingSubscription {
  return Boolean(
    value && typeof value.id === "string" && typeof value.service === "string",
  );
}

function isAlert(
  value: DashboardSubscriptionAlert | null | undefined,
): value is DashboardSubscriptionAlert {
  return Boolean(
    value && typeof value.id === "string" && typeof value.service === "string",
  );
}
