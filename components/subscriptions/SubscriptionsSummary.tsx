import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import {
  formatMoney,
  formatMoneyList,
  isLiveSubscription,
  isStoppedSubscription,
  type Subscription,
  type SubscriptionTotals,
} from "@/lib/subscriptions";
import { TONE_TEXT } from "./shared";

type StatusFilter = "renewing" | "trials" | "stopped";

type SubscriptionsSummaryProps = {
  items: Subscription[];
  totals: SubscriptionTotals;
  onOpen: (item: Subscription) => void;
  onFilter: (filter: StatusFilter) => void;
};

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SubscriptionsSummary({
  items,
  totals,
  onOpen,
  onFilter,
}: SubscriptionsSummaryProps) {
  const monthly = formatMoneyList(totals.monthly);
  const yearly = formatMoneyList(totals.yearly);
  const due = formatMoneyList(totals.dueIn30Days);
  const upcoming = items
    .filter(
      (item) =>
        isLiveSubscription(item) && !item.overdue && item.daysUntilCharge <= 30,
    )
    .sort((a, b) => a.daysUntilCharge - b.daysUntilCharge)
    .slice(0, 3);
  const active = items.filter((item) => item.status === "ACTIVE").length;
  const trials = items.filter((item) => item.status === "TRIAL").length;
  const stopped = items.filter(isStoppedSubscription).length;

  const breakdown: {
    key: StatusFilter;
    label: string;
    count: number;
    dot: string;
  }[] = [
    { key: "renewing", label: "Active", count: active, dot: "bg-accent" },
    { key: "trials", label: "Trial", count: trials, dot: "bg-warning" },
    { key: "stopped", label: "Paused or canceled", count: stopped, dot: "bg-primary/30" },
  ];

  return (
    <GlassCard className="grid p-0 lg:grid-cols-[1.2fr_1.3fr_1fr]">
      <div className="flex flex-col justify-between gap-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary/50">
          Monthly cost
        </p>
        <div>
          <p className="text-4xl font-semibold tracking-tight text-accent">
            {monthly.value}
          </p>
          {monthly.rest ? (
            <p className="mt-1 text-xs text-primary/45">{monthly.rest}</p>
          ) : null}
          <p className="mt-2 text-sm text-primary/60">
            <span className="font-semibold text-primary">{yearly.value}</span> a year
            {yearly.rest ? ` · ${yearly.rest}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-glass p-5 lg:border-l lg:border-t-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/50">
            Next 30 days
          </p>
          <p className="text-sm font-semibold text-primary">
            {due.value}
            {due.rest ? <span className="font-normal text-primary/45"> · {due.rest}</span> : null}
          </p>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-primary/50">Nothing charges in the next 30 days.</p>
        ) : (
          <ul className="flex flex-col">
            {upcoming.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                    {item.service}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      item.daysUntilCharge <= 3 ? TONE_TEXT.warning : "text-primary/50",
                    )}
                  >
                    {item.daysUntilCharge <= 0 ? "Today" : shortDate(item.nextChargeAt)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-primary/80">
                    {formatMoney(item.amount, item.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-glass p-5 lg:border-l lg:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary/50">
          Breakdown
        </p>
        <ul className="flex flex-col gap-1">
          {breakdown.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onFilter(row.key)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span aria-hidden className={cn("size-2 rounded-full", row.dot)} />
                <span className="flex-1 text-primary/70">{row.label}</span>
                <span className="font-semibold tabular-nums text-primary">{row.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}

type OverdueBannerProps = {
  count: number;
  reviewing: boolean;
  busy: boolean;
  onRenewAll: () => void;
  onReview: () => void;
};

export function OverdueBanner({
  count,
  reviewing,
  busy,
  onRenewAll,
  onReview,
}: OverdueBannerProps) {
  if (count <= 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div>
          <p className="text-sm font-semibold text-primary">
            {count === 1
              ? "1 charge date has passed"
              : `${count} charge dates have passed`}
          </p>
          <p className="mt-0.5 text-xs text-primary/60">
            Nova never moves a date on its own. If they already charged, renew them and the dates
            roll to the next cycle.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={onReview}>
          {reviewing ? "Show all" : "Review"}
        </Button>
        <Button
          variant="accent"
          className="inline-flex items-center"
          onClick={onRenewAll}
          disabled={busy}
        >
          <RefreshCw className="mr-1.5 size-4" />
          {busy ? "Renewing…" : "Renew all"}
        </Button>
      </div>
    </div>
  );
}
