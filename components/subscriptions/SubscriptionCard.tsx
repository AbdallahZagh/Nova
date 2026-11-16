import { Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import {
  cadencePhrase,
  canMarkRenewed,
  formatChargeDate,
  formatMoney,
  formatShortDate,
  isLiveSubscription,
  isStoppedSubscription,
  timingPhrase,
  timingTone,
  type Subscription,
  type SubscriptionQuickAction,
} from "@/lib/subscriptions";
import { ServiceAvatar, StatusPill, TONE_TEXT } from "./shared";

type SubscriptionCardProps = {
  item: Subscription;
  onOpen: (item: Subscription) => void;
  onAction: (item: Subscription, action: SubscriptionQuickAction) => void;
};

export function SubscriptionCard({ item, onOpen, onAction }: SubscriptionCardProps) {
  const live = isLiveSubscription(item);
  const stopped = isStoppedSubscription(item);
  const tone = timingTone(item);
  const overdue = live && item.overdue;
  const renewable = canMarkRenewed(item);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
      className="h-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <GlassCard
        className={cn(
          "flex h-full flex-col gap-4 border-glass p-5 transition duration-200 ease-out",
          "hover:-translate-y-0.5 hover:border-accent/40",
          overdue && "border-danger/40",
          stopped && "opacity-80",
        )}
      >
        <div className="flex items-start gap-3">
          <ServiceAvatar name={item.service} danger={overdue} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-primary">
              {item.service}
            </h3>
            <p className="mt-0.5 truncate text-sm text-primary/55">
              {item.plan?.trim() || cadencePhrase(item.intervalUnit, item.intervalCount)}
            </p>
          </div>
          <StatusPill status={item.status} />
        </div>

        <div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tracking-tight text-primary">
              {formatMoney(item.amount, item.currency)}
            </span>
            <span className="text-sm text-primary/50">
              {cadencePhrase(item.intervalUnit, item.intervalCount)}
            </span>
          </p>
          {item.previousPrice ? (
            <p className="mt-1 text-xs text-warning">
              Was {formatMoney(item.previousPrice.amount, item.previousPrice.currency)} before
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-3 border-t border-glass pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className={cn("flex items-center gap-1.5 font-semibold", TONE_TEXT[tone])}>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
              {timingPhrase(item)}
            </p>
            <p className="shrink-0 text-primary/50">
              {item.status === "TRIAL" ? "Ends " : "Charges "}
              <span className="font-medium text-primary/80">
                {formatChargeDate(item.nextChargeAt)}
              </span>
            </p>
          </div>

          <div className="flex min-h-8 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-primary/45">
              {live && item.lastCancelBy
                ? `Cancel by ${formatShortDate(item.lastCancelBy)}`
                : "\u00a0"}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {renewable ? (
                <CardAction
                  label="Mark renewed"
                  icon={<RefreshCw className="size-3.5" />}
                  primary={item.overdue}
                  onClick={() => onAction(item, "renew")}
                />
              ) : null}
              {live ? (
                <CardAction
                  label="Pause"
                  icon={<Pause className="size-3.5" />}
                  iconOnly
                  onClick={() => onAction(item, "pause")}
                />
              ) : null}
              {item.status === "PAUSED" ? (
                <CardAction
                  label="Resume"
                  icon={<Play className="size-3.5" />}
                  primary
                  onClick={() => onAction(item, "resume")}
                />
              ) : null}
              {item.status === "CANCELED" ? (
                <CardAction
                  label="Reactivate"
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => onAction(item, "reactivate")}
                />
              ) : null}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function CardAction({
  label,
  icon,
  primary,
  iconOnly,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  iconOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50",
        primary
          ? "border-accent bg-accent text-white hover:opacity-90"
          : "border-glass text-primary/70 hover:bg-white/5 hover:text-primary",
      )}
    >
      {icon}
      {iconOnly ? null : label}
    </button>
  );
}
