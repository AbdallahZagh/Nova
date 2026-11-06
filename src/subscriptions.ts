import type {
  MoneyAmount,
  SubscriptionIntervalUnit,
} from "@/api/subscriptions";

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
