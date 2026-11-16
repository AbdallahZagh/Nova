import { useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { deleteSubscriptionApi } from "@/lib/api/subscriptions";
import {
  cadencePhrase,
  canMarkRenewed,
  formatChargeDate,
  formatMoney,
  isLiveSubscription,
  overdueLabel,
  timingPhrase,
  timingTone,
  unitNoun,
  type Subscription,
  type SubscriptionQuickAction,
} from "@/lib/subscriptions";
import { ServiceAvatar, StatusPill, TONE_TEXT } from "./shared";
import { cn } from "@/lib/cn";

type SubscriptionDetailsProps = {
  item: Subscription;
  onEdit: () => void;
  onAction: (item: Subscription, action: SubscriptionQuickAction) => void;
  onDeleted: () => Promise<void>;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary/45">
        {title}
      </h3>
      <dl className="rounded-2xl border border-glass bg-glass-card/40 px-4">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-glass py-2.5 last:border-b-0">
      <dt className="text-sm text-primary/55">{label}</dt>
      <dd className={cn("max-w-[15rem] text-right text-sm text-primary", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}

export function SubscriptionDetails({
  item,
  onEdit,
  onAction,
  onDeleted,
}: SubscriptionDetailsProps) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const live = isLiveSubscription(item);
  const tone = timingTone(item);
  const cancelHref = /^https?:\/\//i.test(item.cancelUrl?.trim() ?? "")
    ? item.cancelUrl!.trim()
    : "";
  const reason = item.reason?.trim() ?? "";
  const payment = item.paymentLabel?.trim() ?? "";

  async function remove() {
    setConfirmDelete(false);
    setDeleting(true);
    setError("");
    try {
      await deleteSubscriptionApi(item.id);
      toast({
        variant: "success",
        title: "Subscription removed",
        message: `${item.service} was deleted.`,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not delete this subscription.";
      setError(message);
      toast({ variant: "error", title: "Delete failed", message });
      setDeleting(false);
      return;
    }
    await onDeleted();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="flex items-start gap-4">
          <ServiceAvatar
            name={item.service}
            danger={live && item.overdue}
            className="size-14 text-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-4xl font-semibold tracking-tight text-accent">
              {formatMoney(item.amount, item.currency)}
            </p>
            <p className="mt-1 text-sm text-primary/55">
              {cadencePhrase(item.intervalUnit, item.intervalCount)}
              {item.plan?.trim() ? ` · ${item.plan.trim()}` : ""}
            </p>
          </div>
          <StatusPill status={item.status} />
        </div>

        {live && canMarkRenewed(item) ? (
          <div
            className={cn(
              "rounded-2xl border p-4",
              item.overdue ? "border-danger/30 bg-danger/10" : "border-accent/30 bg-accent/5",
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              {item.overdue ? <AlertTriangle className="size-4 text-danger" /> : null}
              {item.overdue ? overdueLabel(item.daysUntilCharge) : "Charges today"}
            </p>
            <p className="mt-1 text-xs text-primary/60">
              {item.overdue
                ? `The saved date was ${formatChargeDate(item.nextChargeAt)}. If it already charged, mark it renewed and Nova moves to the next date.`
                : "If it already charged, mark it renewed and Nova moves to the next date."}
            </p>
            <Button
              variant="accent"
              className="mt-3 inline-flex items-center"
              disabled={deleting}
              onClick={() => onAction(item, "renew")}
            >
              <RefreshCw className="mr-1.5 size-4" />
              Mark as renewed
            </Button>
          </div>
        ) : null}

        <Section title="Cost">
          <Row label="Price" value={`${formatMoney(item.amount, item.currency)} ${cadencePhrase(item.intervalUnit, item.intervalCount)}`} />
          <Row label="Per month" value={formatMoney(item.monthlyEquivalent, item.currency)} />
          <Row label="Per year" value={formatMoney(item.yearlyCost, item.currency)} />
          {item.previousPrice ? (
            <Row
              label="Price history"
              value={`Was ${formatMoney(item.previousPrice.amount, item.previousPrice.currency)} until ${formatChargeDate(item.previousPrice.changedAt)}`}
              valueClassName="text-warning"
            />
          ) : null}
        </Section>

        <Section title="Timing">
          <Row label="Next charge" value={formatChargeDate(item.nextChargeAt)} />
          <Row label="Status" value={timingPhrase(item)} valueClassName={cn("font-medium", TONE_TEXT[tone])} />
          <Row
            label="Repeats"
            value={
              item.intervalCount === 1
                ? `Every ${unitNoun(item.intervalUnit)}`
                : `Every ${item.intervalCount} ${unitNoun(item.intervalUnit, item.intervalCount)}`
            }
          />
          <Row
            label="Cancel by"
            value={live && item.lastCancelBy ? formatChargeDate(item.lastCancelBy) : ""}
          />
          <Row
            label="Trial ends"
            value={item.trialEndsAt ? formatChargeDate(item.trialEndsAt) : ""}
          />
        </Section>

        <Section title="Reminder">
          <Row
            label="Remind me"
            value={
              item.reminderDays === 0
                ? "Off"
                : `${item.reminderDays} day${item.reminderDays === 1 ? "" : "s"} before`
            }
          />
        </Section>

        {reason || payment ? (
          <Section title="Notes">
            <Row label="Paid with" value={payment} />
            <Row label="Why you keep it" value={reason} />
          </Section>
        ) : null}

        {cancelHref ? (
          <a
            href={cancelHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary transition hover:text-accent"
          >
            Open cancel page
            <ExternalLink className="size-4" />
          </a>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-glass px-6 py-4">
        {error ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            aria-label="Delete subscription"
            className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50 light:border-red-500/40 light:text-red-600"
          >
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete"}
          </button>
          {live ? (
            <SecondaryAction
              label="Pause"
              icon={<Pause className="size-4" />}
              disabled={deleting}
              onClick={() => onAction(item, "pause")}
            />
          ) : item.status === "PAUSED" ? (
            <SecondaryAction
              label="Resume"
              icon={<Play className="size-4" />}
              disabled={deleting}
              onClick={() => onAction(item, "resume")}
            />
          ) : (
            <SecondaryAction
              label="Reactivate"
              icon={<RotateCcw className="size-4" />}
              disabled={deleting}
              onClick={() => onAction(item, "reactivate")}
            />
          )}
          <button
            type="button"
            onClick={onEdit}
            disabled={deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Pencil className="size-4" />
            Edit
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete subscription?"
        message="This removes it from Nova. It does not cancel the charge with the service."
        itemName={item.service}
        confirmLabel="Delete"
      />
    </div>
  );
}

function SecondaryAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl border border-glass px-4 py-2.5 text-sm font-semibold text-primary/80 transition hover:bg-white/5 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
