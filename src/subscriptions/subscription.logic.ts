export const INTERVAL_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const SUBSCRIPTION_REMINDER_TYPE = 'SUBSCRIPTION_CHARGE_SOON';
/** Longer than 120 calendar days so a daylight-saving shift still dedups the cycle. */
export const REMINDER_LOOKBACK_MS = 122 * 24 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;
const MAX_CENTS = 999_999_999_999n;
const ROLL_LOOP_CAP = 600;

export type MoneyTotal = {
  currency: string;
  amount: string;
};

export type SubscriptionPriceSnapshot = {
  id?: string;
  amount: unknown;
  currency: string;
  changedAt: Date;
};

export type SubscriptionSnapshot = {
  id: string;
  service: string;
  plan: string | null;
  amount: unknown;
  currency: string;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  nextChargeAt: Date;
  trialEndsAt: Date | null;
  status: string;
  reason: string | null;
  cancelUrl: string | null;
  reminderDays: number;
  paymentLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  prices?: SubscriptionPriceSnapshot[];
};

export type SubscriptionPreviousPrice = {
  amount: string;
  currency: string;
  changedAt: string;
};

export type SubscriptionResponse = {
  id: string;
  service: string;
  plan: string | null;
  amount: string;
  currency: string;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  nextChargeAt: string;
  trialEndsAt: string | null;
  status: string;
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
  dueIn30Days: MoneyTotal[];
  yearly: MoneyTotal[];
  activeCount: number;
};

export type UpcomingSubscription = {
  id: string;
  service: string;
  plan: string | null;
  amount: string;
  currency: string;
  nextChargeAt: string;
  trialEndsAt: string | null;
  daysUntilCharge: number;
  inWarningWindow: boolean;
  status: string;
};

export type DashboardSubscriptions = {
  dueIn30Days: MoneyTotal[];
  next: UpcomingSubscription | null;
  upcoming: UpcomingSubscription[];
  alerts: UpcomingSubscription[];
};

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS,
  );
}

export function daysUntilCharge(anchor: Date, now: Date): number {
  return calendarDaysBetween(now, anchor);
}

export function isBillableStatus(status: string): boolean {
  return status === 'ACTIVE' || status === 'TRIAL';
}

export function anchorDate(row: {
  status: string;
  trialEndsAt: Date | null;
  nextChargeAt: Date;
}): Date {
  if (row.status === 'TRIAL' && row.trialEndsAt) return row.trialEndsAt;
  return row.nextChargeAt;
}

export function isInWarningWindow(
  status: string,
  days: number,
  reminderDays: number,
): boolean {
  return isBillableStatus(status) && days >= 0 && days <= reminderDays;
}

export function isDueWithin30Days(nextChargeAt: Date, now: Date): boolean {
  const charge = startOfDay(nextChargeAt).getTime();
  const start = startOfDay(now).getTime();
  const end = addDays(startOfDay(now), 30).getTime();
  return charge >= start && charge <= end;
}

export function shouldRoll(
  status: string,
  nextChargeAt: Date,
  now: Date,
): boolean {
  return (
    isBillableStatus(status) &&
    startOfDay(nextChargeAt).getTime() < startOfDay(now).getTime()
  );
}

export function lastCancelBy(nextChargeAt: Date): string {
  const day = startOfDay(nextChargeAt);
  day.setDate(day.getDate() - 1);
  return formatLocalDate(day);
}

export function parseCents(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 9_999_999_999.99) {
      return null;
    }
    const cents = Math.round(value * 100);
    if (Math.abs(value * 100 - cents) > 1e-6) return null;
    return BigInt(cents);
  }
  const text = amountText(value);
  if (text == null) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  let cents = BigInt(match[2]) * 100n + BigInt((fraction + '00').slice(0, 2));
  if ((fraction[2] ?? '0') >= '5') cents += 1n;
  return sign * cents;
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

export function formatMoney(value: unknown): string {
  const cents = parseCents(value);
  if (cents == null) throw new Error('Invalid amount');
  return formatCents(cents);
}

export function isPositiveMoney(value: unknown): boolean {
  const cents = parseCents(value);
  return cents != null && cents > 0n && cents <= MAX_CENTS;
}

function hasAtMostTwoDecimalPlaces(value: number) {
  if (!Number.isFinite(value)) return false;
  const cents = Math.round(value * 100);
  return (
    Math.abs(value * 100 - cents) <= 1e-6 &&
    Math.abs(value - cents / 100) <= 1e-8
  );
}

export function normalizeAmountInput(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!hasAtMostTwoDecimalPlaces(value)) return value;
    const cents = parseCents(value);
    if (cents == null) return value;
    return formatCents(cents);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return trimmed;
    const cents = parseCents(trimmed);
    if (cents == null) return trimmed;
    return formatCents(cents);
  }
  return value;
}

export function monthlyEquivalent(
  amount: unknown,
  unit: IntervalUnit,
  intervalCount: number,
): string {
  return formatCents(monthlyCents(amount, unit, intervalCount));
}

export function yearlyCost(
  amount: unknown,
  unit: IntervalUnit,
  intervalCount: number,
): string {
  return formatCents(yearlyCents(amount, unit, intervalCount));
}

export function rollChargeDate(
  nextChargeAt: Date,
  unit: IntervalUnit,
  intervalCount: number,
  now: Date = new Date(),
): Date {
  const today = startOfDay(now).getTime();
  const count = Math.max(1, Math.trunc(intervalCount) || 1);
  let cursor = new Date(nextChargeAt.getTime());
  for (let step = 0; step < ROLL_LOOP_CAP; step += 1) {
    if (startOfDay(cursor).getTime() >= today) return cursor;
    const next = addInterval(cursor, unit, count);
    if (Number.isNaN(next.getTime()) || next.getTime() <= cursor.getTime()) {
      return cursor;
    }
    cursor = next;
  }
  if (startOfDay(cursor).getTime() >= today) return cursor;
  return jumpChargeDate(cursor, unit, count, startOfDay(now));
}

export function summarizeSubscriptions(
  rows: SubscriptionSnapshot[],
  now: Date,
): SubscriptionTotals {
  const active = rows.filter((row) => isBillableStatus(row.status));
  return {
    dueIn30Days: sumByCurrency(
      active
        .filter((row) => isDueWithin30Days(row.nextChargeAt, now))
        .map((row) => ({
          currency: row.currency,
          cents: requireCents(row.amount),
        })),
    ),
    yearly: sumByCurrency(
      active.map((row) => ({
        currency: row.currency,
        cents: yearlyCents(row.amount, row.intervalUnit, row.intervalCount),
      })),
    ),
    activeCount: active.length,
  };
}

export function toSubscriptionResponse(
  row: SubscriptionSnapshot,
  now: Date,
): SubscriptionResponse {
  const amount = formatMoney(row.amount);
  const currency = row.currency.trim().toUpperCase();
  const anchor = anchorDate(row);
  const days = daysUntilCharge(anchor, now);
  return {
    id: row.id,
    service: row.service,
    plan: row.plan,
    amount,
    currency,
    intervalUnit: row.intervalUnit,
    intervalCount: row.intervalCount,
    nextChargeAt: row.nextChargeAt.toISOString(),
    trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
    status: row.status,
    reason: row.reason,
    cancelUrl: row.cancelUrl,
    reminderDays: row.reminderDays,
    paymentLabel: row.paymentLabel,
    lastCancelBy: lastCancelBy(row.nextChargeAt),
    monthlyEquivalent: monthlyEquivalent(
      amount,
      row.intervalUnit,
      row.intervalCount,
    ),
    yearlyCost: yearlyCost(amount, row.intervalUnit, row.intervalCount),
    daysUntilCharge: days,
    inWarningWindow: isInWarningWindow(row.status, days, row.reminderDays),
    previousPrice: previousPrice(row.prices),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUpcoming(
  row: SubscriptionSnapshot,
  now: Date,
): UpcomingSubscription {
  const response = toSubscriptionResponse(row, now);
  return {
    id: response.id,
    service: response.service,
    plan: response.plan,
    amount: response.amount,
    currency: response.currency,
    nextChargeAt: response.nextChargeAt,
    trialEndsAt: response.trialEndsAt,
    daysUntilCharge: response.daysUntilCharge,
    inWarningWindow: response.inWarningWindow,
    status: response.status,
  };
}

export function toDashboardSubscriptions(
  rows: SubscriptionSnapshot[],
  now: Date,
): DashboardSubscriptions {
  const living = rows
    .filter((row) => isBillableStatus(row.status))
    .sort(
      (a, b) =>
        a.nextChargeAt.getTime() - b.nextChargeAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const upcoming = living.slice(0, 3).map((row) => toUpcoming(row, now));
  const alerts = living
    .map((row) => toUpcoming(row, now))
    .filter((item) => item.inWarningWindow)
    .sort(
      (a, b) =>
        a.daysUntilCharge - b.daysUntilCharge ||
        a.nextChargeAt.localeCompare(b.nextChargeAt),
    );
  return {
    dueIn30Days: summarizeSubscriptions(rows, now).dueIn30Days,
    next: upcoming[0] ?? null,
    upcoming,
    alerts,
  };
}

export function sortSubscriptionResponses<
  T extends { status: string; nextChargeAt: string; id: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    const byCharge = a.nextChargeAt.localeCompare(b.nextChargeAt);
    if (byCharge !== 0) return byCharge;
    return a.id.localeCompare(b.id);
  });
}

export function trialReminderBody(
  service: string,
  days: number,
  amount: string,
  currency: string,
): string {
  return `${service} trial ends ${whenPhrase(days)}, then ${amount} ${currency}.`;
}

export function renewalReminderBody(
  service: string,
  days: number,
  amount: string,
  currency: string,
): string {
  return `${service} renews ${whenPhrase(days)} · ${amount} ${currency}.`;
}

export function metadataChargeKey(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  if (typeof record.subscriptionId !== 'string' || !record.subscriptionId) {
    return null;
  }
  const chargeDate = normalizeIso(record.chargeDate);
  if (!chargeDate) return null;
  return `${record.subscriptionId}::${chargeDate}`;
}

export function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function whenPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  return `in ${days} days`;
}

function normalizeIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function statusRank(status: string): number {
  if (isBillableStatus(status)) return 0;
  if (status === 'PAUSED') return 1;
  return 2;
}

function previousPrice(
  prices: SubscriptionPriceSnapshot[] | undefined,
): SubscriptionPreviousPrice | null {
  const ordered = [...(prices ?? [])].sort((a, b) => {
    const byTime = a.changedAt.getTime() - b.changedAt.getTime();
    if (byTime !== 0) return byTime;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  if (ordered.length < 2) return null;
  const previous = ordered[ordered.length - 2];
  return {
    amount: formatMoney(previous.amount),
    currency: previous.currency.trim().toUpperCase(),
    changedAt: previous.changedAt.toISOString(),
  };
}

function sumByCurrency(
  entries: { currency: string; cents: bigint }[],
): MoneyTotal[] {
  const totals = new Map<string, bigint>();
  for (const entry of entries) {
    const currency = entry.currency.trim().toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0n) + entry.cents);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, cents]) => ({ currency, amount: formatCents(cents) }));
}

function monthlyCents(
  amount: unknown,
  unit: IntervalUnit,
  intervalCount: number,
): bigint {
  const { numerator, denominator } = billingFactors(unit, intervalCount);
  return divRoundHalfUp(requireCents(amount) * numerator, denominator);
}

function yearlyCents(
  amount: unknown,
  unit: IntervalUnit,
  intervalCount: number,
): bigint {
  const { numerator, denominator } = billingFactors(unit, intervalCount);
  return divRoundHalfUp(requireCents(amount) * numerator * 12n, denominator);
}

function billingFactors(
  unit: IntervalUnit,
  intervalCount: number,
): { numerator: bigint; denominator: bigint } {
  const count = BigInt(Math.max(1, Math.trunc(intervalCount) || 1));
  switch (unit) {
    case 'MONTH':
      return { numerator: 1n, denominator: count };
    case 'YEAR':
      return { numerator: 1n, denominator: 12n * count };
    case 'WEEK':
      return { numerator: 52n, denominator: 12n * count };
    case 'DAY':
      return { numerator: 365n, denominator: 12n * count };
    default:
      return { numerator: 1n, denominator: count };
  }
}

function requireCents(amount: unknown): bigint {
  const cents = parseCents(amount);
  if (cents == null) throw new Error('Invalid amount');
  return cents;
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('intervalCount must be at least 1');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function addInterval(date: Date, unit: IntervalUnit, count: number): Date {
  switch (unit) {
    case 'DAY':
      return addDays(date, count);
    case 'WEEK':
      return addDays(date, count * 7);
    case 'MONTH':
      return addMonths(date, count);
    case 'YEAR':
      return addMonths(date, count * 12);
    default:
      return addMonths(date, count);
  }
}

function jumpChargeDate(
  cursor: Date,
  unit: IntervalUnit,
  count: number,
  todayStart: Date,
): Date {
  if (startOfDay(cursor).getTime() >= todayStart.getTime()) {
    return new Date(cursor.getTime());
  }
  if (unit === 'DAY' || unit === 'WEEK') {
    const span = unit === 'WEEK' ? count * 7 : count;
    const behind = Math.max(1, calendarDaysBetween(cursor, todayStart));
    const steps = Math.max(1, Math.ceil(behind / span));
    return addDays(cursor, steps * span);
  }
  const monthsPerStep = unit === 'YEAR' ? count * 12 : count;
  let low = 1;
  let high = 1;
  while (
    startOfDay(addMonths(cursor, high * monthsPerStep)).getTime() <
    todayStart.getTime()
  ) {
    high *= 2;
    if (high > 1_000_000) return addMonths(cursor, high * monthsPerStep);
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (
      startOfDay(addMonths(cursor, mid * monthsPerStep)).getTime() <
      todayStart.getTime()
    ) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return addMonths(cursor, low * monthsPerStep);
}

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function amountText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    const toString = (value as { toString?: unknown }).toString;
    if (typeof toString !== 'function') return null;
    const text = toString.call(value);
    if (typeof text !== 'string' || !text || text === '[object Object]') return null;
    return text;
  }
  return null;
}
