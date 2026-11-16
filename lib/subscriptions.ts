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
  /** The saved charge date has passed; it stays as saved until the user marks it renewed. */
  overdue: boolean;
  inWarningWindow: boolean;
  previousPrice: SubscriptionPriceChange | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionTotals = {
  overdueCount: number;
  monthly: MoneyTotal[];
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
  overdue?: boolean;
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
  monthly: MoneyTotal[];
  activeCount: number;
  overdueCount: number;
  next: DashboardSubscriptionNext | null;
  upcoming: DashboardUpcomingSubscription[];
  alerts: DashboardSubscriptionAlert[];
};

export const EMPTY_SUBSCRIPTION_TOTALS: SubscriptionTotals = {
  overdueCount: 0,
  monthly: [],
  dueIn30Days: [],
  yearly: [],
  activeCount: 0,
};

export const EMPTY_DASHBOARD_SUBSCRIPTIONS: DashboardSubscriptions = {
  dueIn30Days: [],
  monthly: [],
  activeCount: 0,
  overdueCount: 0,
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

/** How long ago a passed charge date was, for the "Overdue" chip. */
export function overdueLabel(days: number): string {
  const count = Math.max(
    1,
    Math.floor(Math.abs(Number.isFinite(days) ? days : 1)),
  );
  return count === 1 ? "1 day overdue" : `${count} days overdue`;
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

/** "Nov 9", for tight spaces. */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = parseChargeDate(value);
  if (!date) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export type SubscriptionTone = "danger" | "warning" | "accent" | "muted";

export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "INR",
  "EGP",
  "AED",
  "SAR",
] as const;

export function isLiveSubscription(item: Pick<Subscription, "status">): boolean {
  return item.status === "ACTIVE" || item.status === "TRIAL";
}

export function isStoppedSubscription(item: Pick<Subscription, "status">): boolean {
  return item.status === "PAUSED" || item.status === "CANCELED";
}

export function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "TRIAL":
      return "Trial";
    case "PAUSED":
      return "Paused";
    case "CANCELED":
      return "Canceled";
    default:
      return status;
  }
}

export function statusTone(status: SubscriptionStatus): SubscriptionTone {
  if (status === "ACTIVE") return "accent";
  if (status === "TRIAL") return "warning";
  return "muted";
}

const UNIT_NOUN: Record<SubscriptionIntervalUnit, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

export function unitNoun(unit: SubscriptionIntervalUnit, count = 1): string {
  const noun = UNIT_NOUN[unit] ?? "month";
  return count === 1 ? noun : `${noun}s`;
}

/** "per month" or "every 3 months". */
export function cadencePhrase(
  unit: SubscriptionIntervalUnit,
  count: number,
): string {
  const every = count > 0 ? Math.trunc(count) : 1;
  if (every === 1) return `per ${unitNoun(unit)}`;
  return `every ${every} ${unitNoun(unit, every)}`;
}

/** The one-line timing for a card: "3 days overdue", "Renews in 4 days", "Trial ends today". */
export function timingPhrase(item: Subscription): string {
  if (item.status === "PAUSED") return "Paused";
  if (item.status === "CANCELED") return "Canceled";
  if (item.overdue) return overdueLabel(item.daysUntilCharge);
  const when = daysLabel(item.daysUntilCharge);
  if (item.status === "TRIAL") {
    return when === "today" ? "Trial ends today" : `Trial ends ${when}`;
  }
  return when === "today" ? "Renews today" : `Renews ${when}`;
}

export function timingTone(item: Subscription): SubscriptionTone {
  if (isStoppedSubscription(item)) return "muted";
  if (item.overdue) return "danger";
  if (item.inWarningWindow || item.daysUntilCharge <= 3) return "warning";
  return "muted";
}

/** A charge that has passed, or lands today, can be marked as renewed. */
export function canMarkRenewed(item: Subscription): boolean {
  return isLiveSubscription(item) && (item.overdue || item.daysUntilCharge <= 0);
}

export function dateFromKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function keyFromDate(date: Date | null): string {
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isBeforeToday(value: string): boolean {
  const chosen = dateFromKey(value);
  if (!chosen) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return chosen.getTime() < today.getTime();
}

function dayStart(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addCycle(
  date: Date,
  unit: SubscriptionIntervalUnit,
  count: number,
): Date {
  const next = new Date(date);
  const every = count > 0 ? Math.trunc(count) : 1;
  if (unit === "DAY") next.setDate(next.getDate() + every);
  else if (unit === "WEEK") next.setDate(next.getDate() + 7 * every);
  else {
    const day = next.getDate();
    next.setDate(1);
    if (unit === "MONTH") next.setMonth(next.getMonth() + every);
    else next.setFullYear(next.getFullYear() + every);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, last));
  }
  return next;
}

export type SubscriptionQuickAction = "renew" | "pause" | "resume" | "reactivate";

/**
 * What a row looks like right after an action, so the screen can update at once.
 * The server answer replaces it a moment later.
 */
export function applyQuickAction(
  item: Subscription,
  action: SubscriptionQuickAction,
  now = new Date(),
): Subscription {
  if (action === "pause") {
    return { ...item, status: "PAUSED", overdue: false, inWarningWindow: false };
  }
  if (action === "resume" || action === "reactivate") {
    return {
      ...item,
      status: "ACTIVE",
      overdue: item.daysUntilCharge < 0,
    };
  }

  const today = dayStart(now);
  const current = new Date(item.nextChargeAt);
  if (Number.isNaN(current.getTime())) return item;
  let next = new Date(current);
  if (dayStart(next).getTime() === today.getTime()) {
    next = addCycle(next, item.intervalUnit, item.intervalCount);
  }
  let guard = 0;
  while (dayStart(next).getTime() < today.getTime() && guard < 1000) {
    next = addCycle(next, item.intervalUnit, item.intervalCount);
    guard += 1;
  }
  const days = Math.round(
    (dayStart(next).getTime() - today.getTime()) / 86_400_000,
  );
  const shift = next.getTime() - current.getTime();
  const lastCancelBy = item.lastCancelBy
    ? new Date(new Date(item.lastCancelBy).getTime() + shift).toISOString()
    : item.lastCancelBy;
  const trialOver =
    item.status === "TRIAL" &&
    (!item.trialEndsAt || dayStart(new Date(item.trialEndsAt)) <= today);
  return {
    ...item,
    status: trialOver ? "ACTIVE" : item.status,
    nextChargeAt: next.toISOString(),
    daysUntilCharge: days,
    overdue: false,
    inWarningWindow: days <= item.reminderDays,
    lastCancelBy,
  };
}

export function normalizeSubscriptionList(
  data: Partial<SubscriptionListResponse> | null | undefined,
): SubscriptionListResponse {
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    totals: {
      overdueCount: asCount(data?.totals?.overdueCount),
      monthly: asMoneyTotals(data?.totals?.monthly),
      dueIn30Days: asMoneyTotals(data?.totals?.dueIn30Days),
      yearly: asMoneyTotals(data?.totals?.yearly),
      activeCount: asCount(data?.totals?.activeCount),
    },
  };
}

export function normalizeDashboardSubscriptions(
  value: Partial<DashboardSubscriptions> | null | undefined,
): DashboardSubscriptions {
  if (!value || typeof value !== "object") return EMPTY_DASHBOARD_SUBSCRIPTIONS;

  const next = asDashboardNext(value.next);
  const upcoming = Array.isArray(value.upcoming)
    ? value.upcoming.filter(isUpcoming).slice(0, 4)
    : [];
  const alerts = Array.isArray(value.alerts) ? value.alerts.filter(isAlert) : [];

  return {
    dueIn30Days: asMoneyTotals(value.dueIn30Days),
    monthly: asMoneyTotals(value.monthly),
    activeCount: asCount(value.activeCount),
    overdueCount: asCount(value.overdueCount),
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

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
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
