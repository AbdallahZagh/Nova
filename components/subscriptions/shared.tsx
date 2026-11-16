import { cn } from "@/lib/cn";
import {
  statusLabel,
  statusTone,
  type Subscription,
  type SubscriptionTone,
} from "@/lib/subscriptions";

export const TONE_CHIP: Record<SubscriptionTone, string> = {
  danger: "border-danger/40 bg-danger/10 text-danger",
  warning: "border-warning/40 bg-warning/10 text-warning",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-glass bg-white/5 text-primary/60",
};

export const TONE_TEXT: Record<SubscriptionTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
  muted: "text-primary/60",
};

export function ServiceAvatar({
  name,
  danger,
  className,
}: {
  name: string;
  danger?: boolean;
  className?: string;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold",
        danger ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent",
        className,
      )}
    >
      {letter}
    </span>
  );
}

export function StatusPill({
  status,
  className,
}: {
  status: Subscription["status"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CHIP[statusTone(status)],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}
