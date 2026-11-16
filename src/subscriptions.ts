import type {
  MoneyAmount,
  Subscription,
  SubscriptionIntervalUnit,
  SubscriptionStatus,
  SubscriptionTotals,
} from "@/api/subscriptions";

export const EMPTY_SUBSCRIPTION_TOTALS: SubscriptionTotals = {
  overdueCount: 0,
  monthly: [],
  dueIn30Days: [],
  yearly: [],
  activeCount: 0,
};

function wholeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Keeps every total the server sends, including the monthly cost and the overdue count. */
export function normalizeTotals(
  totals: Partial<SubscriptionTotals> | null | undefined,
): SubscriptionTotals {
  if (!totals) return EMPTY_SUBSCRIPTION_TOTALS;
  return {
    overdueCount: wholeCount(totals.overdueCount),
    monthly: Array.isArray(totals.monthly) ? totals.monthly : [],
    dueIn30Days: Array.isArray(totals.dueIn30Days) ? totals.dueIn30Days : [],
    yearly: Array.isArray(totals.yearly) ? totals.yearly : [],
    activeCount: wholeCount(totals.activeCount),
  };
}

export function isLiveSubscription(item: Pick<Subscription, "status">) {
  return item.status === "ACTIVE" || item.status === "TRIAL";
}

export function isStoppedSubscription(item: Pick<Subscription, "status">) {
  return item.status === "PAUSED" || item.status === "CANCELED";
}

export function isOverdueSubscription(
  item: Pick<Subscription, "status" | "overdue" | "daysUntilCharge">,
) {
  return (
    isLiveSubscription(item) &&
    (item.overdue === true || item.daysUntilCharge < 0)
  );
}

/** A charge that has passed, or lands today, can be marked as renewed. */
export function canMarkRenewed(
  item: Pick<Subscription, "status" | "overdue" | "daysUntilCharge">,
) {
  return isLiveSubscription(item) && (isOverdueSubscription(item) || item.daysUntilCharge <= 0);
}

export function statusLabel(status: SubscriptionStatus) {
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

export function overdueLabel(days: number | null | undefined) {
  const count = Math.max(
    1,
    Math.floor(Math.abs(typeof days === "number" && Number.isFinite(days) ? days : 1)),
  );
  return count === 1 ? "1 day overdue" : `${count} days overdue`;
}

/** One line for a card: "3 days overdue", "Renews in 4 days", "Paused". */
export function subscriptionTimingLabel(
  item: Pick<Subscription, "status" | "overdue" | "daysUntilCharge">,
) {
  if (item.status === "PAUSED") return "Paused";
  if (item.status === "CANCELED") return "Canceled";
  if (isOverdueSubscription(item)) return overdueLabel(item.daysUntilCharge);
  return chargeTimingLabel(item.status, item.daysUntilCharge);
}

export type SubscriptionQuickAction = "renew" | "pause" | "resume" | "reactivate";

function dayStart(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addCycle(date: Date, unit: SubscriptionIntervalUnit, count: number) {
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
    return { ...item, status: "ACTIVE", overdue: item.daysUntilCharge < 0 };
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
  const days = Math.round((dayStart(next).getTime() - today.getTime()) / 86_400_000);
  const shift = next.getTime() - current.getTime();
  const lastCancelBy = item.lastCancelBy
    ? new Date(new Date(item.lastCancelBy).getTime() + shift).toISOString()
    : item.lastCancelBy;
  const trialOver =
    item.status === "TRIAL" &&
    (!item.trialEndsAt || dayStart(new Date(item.trialEndsAt)).getTime() <= today.getTime());
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

const INTERVAL_SINGULAR: Record<SubscriptionIntervalUnit, string> = {
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};

const INTERVAL_NOUN: Record<SubscriptionIntervalUnit, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

function isIntervalUnit(value: string): value is SubscriptionIntervalUnit {
  return value === "DAY" || value === "WEEK" || value === "MONTH" || value === "YEAR";
}

export function formatMoney(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
) {
  const code = (typeof currency === "string" ? currency : "").trim().toUpperCase();
  const raw =
    typeof amount === "number"
      ? String(amount)
      : typeof amount === "string"
        ? amount.trim()
        : "";
  const numeric = Number(raw);
  if (!code || raw === "" || !Number.isFinite(numeric)) {
    return [raw, code].filter(Boolean).join(" ");
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(numeric);
  } catch {
    return `${raw} ${code}`.trim();
  }
}

export function formatMoneyList(
  amounts: MoneyAmount[] | null | undefined,
) {
  if (!Array.isArray(amounts) || amounts.length === 0) return "";
  return amounts
    .map((item) => formatMoney(item?.amount, item?.currency))
    .filter(Boolean)
    .join(" · ");
}

export function daysLabel(days: number | null | undefined) {
  if (typeof days !== "number" || !Number.isFinite(days)) return "";
  const whole = Math.trunc(days);
  if (whole === 0) return "today";
  if (whole === 1) return "in 1 day";
  if (whole > 1) return `in ${whole} days`;
  const ago = Math.abs(whole);
  return ago === 1 ? "1 day ago" : `${ago} days ago`;
}

export function intervalLabel(
  unit: string | null | undefined,
  count: number | null | undefined,
) {
  const normalized = (unit ?? "").trim().toUpperCase();
  if (!isIntervalUnit(normalized)) return "";
  const every =
    typeof count === "number" && Number.isFinite(count) && count > 0
      ? Math.trunc(count)
      : 1;
  if (every === 1) return INTERVAL_SINGULAR[normalized];
  return `Every ${every} ${INTERVAL_NOUN[normalized]}s`;
}

export function chargeTimingLabel(
  status: string | null | undefined,
  days: number | null | undefined,
) {
  const when = daysLabel(days);
  if (!when) return "";
  if (status === "TRIAL") {
    return when === "today" ? "Trial ends today" : `Trial ends ${when}`;
  }
  return when === "today" ? "Renews today" : `Renews ${when}`;
}

export function dateKeyFromIso(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

export function dateKeyToIso(value: string) {
  const key = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return `${key}T12:00:00.000Z`;
}

export function formatSubscriptionDate(value?: string | null) {
  if (!value) return "";
  const key = dateKeyFromIso(value);
  if (!key) return value;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isHttpUrl(value?: string | null) {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export function parseSubscriptionAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toFixed(2);
}
