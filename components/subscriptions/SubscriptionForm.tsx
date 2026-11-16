import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/Calendar";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  createSubscriptionApi,
  deleteSubscriptionApi,
  updateSubscriptionApi,
} from "@/lib/api/subscriptions";
import { cn } from "@/lib/cn";
import {
  COMMON_CURRENCIES,
  dateFromKey,
  dateInputToIso,
  isBeforeToday,
  keyFromDate,
  toDateInputValue,
  unitNoun,
  type Subscription,
  type SubscriptionIntervalUnit,
  type SubscriptionStatus,
  type SubscriptionWriteInput,
} from "@/lib/subscriptions";

type FormState = {
  service: string;
  plan: string;
  amount: string;
  currency: string;
  intervalUnit: SubscriptionIntervalUnit;
  intervalCount: string;
  nextChargeAt: string;
  trialEndsAt: string;
  status: SubscriptionStatus;
  reason: string;
  cancelUrl: string;
  reminderDays: string;
  paymentLabel: string;
};

const EMPTY_FORM: FormState = {
  service: "",
  plan: "",
  amount: "",
  currency: "USD",
  intervalUnit: "MONTH",
  intervalCount: "1",
  nextChargeAt: "",
  trialEndsAt: "",
  status: "ACTIVE",
  reason: "",
  cancelUrl: "",
  reminderDays: "3",
  paymentLabel: "",
};

const OTHER_CURRENCY = "OTHER";

const CURRENCY_OPTIONS = [
  ...COMMON_CURRENCIES.map((code) => ({ value: code, label: code })),
  { value: OTHER_CURRENCY, label: "Other…" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRIAL", label: "Trial" },
  { value: "PAUSED", label: "Paused" },
  { value: "CANCELED", label: "Canceled" },
];

function formFromSubscription(item: Subscription): FormState {
  return {
    service: item.service,
    plan: item.plan ?? "",
    amount: item.amount,
    currency: item.currency,
    intervalUnit: item.intervalUnit,
    intervalCount: String(item.intervalCount || 1),
    nextChargeAt: toDateInputValue(item.nextChargeAt),
    trialEndsAt: toDateInputValue(item.trialEndsAt),
    status: item.status,
    reason: item.reason ?? "",
    cancelUrl: item.cancelUrl ?? "",
    reminderDays: String(item.reminderDays ?? 3),
    paymentLabel: item.paymentLabel ?? "",
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-primary/45">{hint}</p> : null}
    </div>
  );
}

type SubscriptionFormProps = {
  subscription: Subscription | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
};

export function SubscriptionForm({ subscription, onSaved, onCancel }: SubscriptionFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    subscription ? formFromSubscription(subscription) : EMPTY_FORM,
  );
  const [customCurrency, setCustomCurrency] = useState(
    () =>
      Boolean(subscription) &&
      !(COMMON_CURRENCIES as readonly string[]).includes(subscription!.currency),
  );
  const [showMore, setShowMore] = useState(() =>
    subscription
      ? Boolean(
          subscription.reason?.trim() ||
            subscription.cancelUrl?.trim() ||
            subscription.paymentLabel?.trim(),
        )
      : false,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const busy = saving || deleting;
  const count = Math.max(1, Math.trunc(Number(form.intervalCount)) || 1);
  const reminder = Math.trunc(Number(form.reminderDays));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const service = form.service.trim();
    const currency = form.currency.trim().toUpperCase();
    const amount = form.amount.trim();
    if (!service || !amount || !currency || !form.nextChargeAt.trim()) {
      setError("Service, amount, currency, and next charge date are required.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Currency must be 3 letters, like USD.");
      return;
    }
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    const intervalCount = Math.trunc(Number(form.intervalCount));
    if (!Number.isFinite(intervalCount) || intervalCount < 1) {
      setError("The cycle must repeat at least every 1.");
      return;
    }
    const reminderDays = Math.trunc(Number(form.reminderDays));
    if (!Number.isFinite(reminderDays) || reminderDays < 0 || reminderDays > 90) {
      setError("Reminder days must be between 0 and 90.");
      return;
    }
    const nextChargeAt = dateInputToIso(form.nextChargeAt);
    if (!nextChargeAt) {
      const message = "Next charge date is invalid.";
      setError(message);
      toast({ variant: "error", title: "Check the date", message });
      return;
    }
    const dateChanged =
      !subscription || form.nextChargeAt !== toDateInputValue(subscription.nextChargeAt);
    if (dateChanged && isBeforeToday(form.nextChargeAt)) {
      const message = "Next charge date cannot be in the past. Choose today or a later date.";
      setError(message);
      toast({ variant: "error", title: "Check the date", message });
      return;
    }
    if (form.status === "TRIAL" && !form.trialEndsAt.trim()) {
      setError("Add the date the trial ends.");
      return;
    }
    const trialEndsAt = form.trialEndsAt.trim() ? dateInputToIso(form.trialEndsAt) : null;
    if (form.trialEndsAt.trim() && !trialEndsAt) {
      setError("Trial end is invalid.");
      return;
    }

    const payload: SubscriptionWriteInput = {
      service,
      amount: numeric.toFixed(2),
      currency,
      intervalUnit: form.intervalUnit,
      intervalCount,
      nextChargeAt,
      status: form.status,
      reminderDays,
      plan: emptyToNull(form.plan),
      trialEndsAt,
      reason: emptyToNull(form.reason),
      cancelUrl: emptyToNull(form.cancelUrl),
      paymentLabel: emptyToNull(form.paymentLabel),
    };
    if (!subscription) {
      for (const key of ["plan", "trialEndsAt", "reason", "cancelUrl", "paymentLabel"] as const) {
        if (payload[key] == null) delete payload[key];
      }
    }

    setSaving(true);
    setError("");
    try {
      if (subscription) await updateSubscriptionApi(subscription.id, payload);
      else await createSubscriptionApi(payload);
      toast({
        variant: "success",
        title: subscription ? "Subscription updated" : "Subscription added",
        message: `${service} is on your list.`,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save this subscription.";
      setError(message);
      toast({
        variant: "error",
        title: subscription ? "Update failed" : "Could not add subscription",
        message,
      });
      return;
    } finally {
      setSaving(false);
    }
    await onSaved();
  }

  async function remove() {
    if (!subscription) return;
    setConfirmDelete(false);
    setDeleting(true);
    setError("");
    try {
      await deleteSubscriptionApi(subscription.id);
      toast({
        variant: "success",
        title: "Subscription removed",
        message: `${subscription.service} was deleted.`,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not delete this subscription.";
      setError(message);
      toast({ variant: "error", title: "Delete failed", message });
      return;
    } finally {
      setDeleting(false);
    }
    await onSaved();
  }

  const currencyChoice = customCurrency
    ? OTHER_CURRENCY
    : (COMMON_CURRENCIES as readonly string[]).includes(form.currency)
      ? form.currency
      : OTHER_CURRENCY;

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service" htmlFor="subscription-service">
            <Input
              id="subscription-service"
              variant="soft"
              value={form.service}
              onChange={(event) => update("service", event.target.value)}
              placeholder="Cursor"
              required
              autoFocus={!subscription}
            />
          </Field>
          <Field label="Plan" htmlFor="subscription-plan">
            <Input
              id="subscription-plan"
              variant="soft"
              value={form.plan}
              onChange={(event) => update("plan", event.target.value)}
              placeholder="Pro"
            />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Amount" htmlFor="subscription-amount">
            <Input
              id="subscription-amount"
              variant="soft"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => update("amount", event.target.value)}
              placeholder="20.00"
              required
            />
          </Field>
          <Field label="Currency" htmlFor="subscription-currency">
            <Select
              id="subscription-currency"
              variant="glass"
              aria-label="Currency"
              searchable
              searchPlaceholder="Search currency"
              value={currencyChoice}
              onChange={(value) => {
                if (value === OTHER_CURRENCY) {
                  setCustomCurrency(true);
                  update("currency", "");
                } else {
                  setCustomCurrency(false);
                  update("currency", value);
                }
              }}
              options={CURRENCY_OPTIONS}
            />
          </Field>
        </div>
        {currencyChoice === OTHER_CURRENCY ? (
          <Field label="Currency code" htmlFor="subscription-currency-code" hint="Three letters, like SEK or BRL.">
            <Input
              id="subscription-currency-code"
              variant="soft"
              value={form.currency}
              maxLength={3}
              onChange={(event) =>
                update("currency", event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase())
              }
              placeholder="SEK"
            />
          </Field>
        ) : null}

        <Field label="Repeats" htmlFor="subscription-interval-count">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-sm text-primary/60">Every</span>
            <Input
              id="subscription-interval-count"
              variant="soft"
              type="number"
              min={1}
              step={1}
              className="w-20! shrink-0"
              value={form.intervalCount}
              onChange={(event) => update("intervalCount", event.target.value)}
            />
            <div className="flex-1">
              <Select
                variant="glass"
                aria-label="Billing period"
                value={form.intervalUnit}
                onChange={(value) => update("intervalUnit", value as SubscriptionIntervalUnit)}
                options={(["DAY", "WEEK", "MONTH", "YEAR"] as const).map((unit) => ({
                  value: unit,
                  label: unitNoun(unit, count),
                }))}
              />
            </div>
          </div>
        </Field>

        <Field label="Next charge date" htmlFor="subscription-next-charge">
          <DatePicker
            id="subscription-next-charge"
            aria-label="Next charge date"
            placeholder="Select date"
            value={dateFromKey(form.nextChargeAt)}
            onChange={(date) => update("nextChargeAt", keyFromDate(date))}
          />
        </Field>

        <Field label="Status" htmlFor="subscription-status">
          <Select
            id="subscription-status"
            variant="glass"
            aria-label="Status"
            value={form.status}
            onChange={(value) => update("status", value as SubscriptionStatus)}
            options={STATUS_OPTIONS}
          />
        </Field>

        {form.status === "TRIAL" ? (
          <Field label="Trial ends" htmlFor="subscription-trial-end" hint="Nova reminds you before the trial turns into a paid plan.">
            <DatePicker
              id="subscription-trial-end"
              aria-label="Trial ends"
              placeholder="Select date"
              value={dateFromKey(form.trialEndsAt)}
              onChange={(date) => update("trialEndsAt", keyFromDate(date))}
            />
          </Field>
        ) : null}

        <Field
          label="Reminder"
          htmlFor="subscription-reminder"
          hint={
            reminder === 0
              ? "No reminder. Nova will not notify you before this charges."
              : `Nova notifies you ${Number.isFinite(reminder) && reminder > 0 ? reminder : "a few"} day${reminder === 1 ? "" : "s"} before the charge, so you can cancel in time. Use 0 to turn it off.`
          }
        >
          <div className="flex items-center gap-3">
            <span className="shrink-0 whitespace-nowrap text-sm text-primary/60">Remind me</span>
            <Input
              id="subscription-reminder"
              variant="soft"
              type="number"
              min={0}
              max={90}
              step={1}
              className="w-20! shrink-0"
              value={form.reminderDays}
              onChange={(event) => update("reminderDays", event.target.value)}
            />
            <span className="shrink-0 whitespace-nowrap text-sm text-primary/60">days before</span>
          </div>
        </Field>

        <button
          type="button"
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary transition hover:text-accent"
        >
          More details
          <ChevronDown className={cn("size-4 transition", showMore && "rotate-180")} />
        </button>

        {showMore ? (
          <div className="space-y-4">
            {form.status !== "TRIAL" ? (
              <Field label="Trial end" htmlFor="subscription-trial-end-optional">
                <DatePicker
                  id="subscription-trial-end-optional"
                  aria-label="Trial end"
                  placeholder="No trial"
                  value={dateFromKey(form.trialEndsAt)}
                  onChange={(date) => update("trialEndsAt", keyFromDate(date))}
                />
              </Field>
            ) : null}
            <Field label="Why you keep it" htmlFor="subscription-reason">
              <Input
                id="subscription-reason"
                variant="soft"
                value={form.reason}
                onChange={(event) => update("reason", event.target.value)}
                placeholder="Needed for work"
              />
            </Field>
            <Field label="Cancel link" htmlFor="subscription-cancel-url">
              <Input
                id="subscription-cancel-url"
                variant="soft"
                type="url"
                value={form.cancelUrl}
                onChange={(event) => update("cancelUrl", event.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="Paid with" htmlFor="subscription-payment">
              <Input
                id="subscription-payment"
                variant="soft"
                value={form.paymentLabel}
                onChange={(event) => update("paymentLabel", event.target.value)}
                placeholder="Visa · 4242"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-glass px-6 py-4">
        {error ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          {subscription ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50 light:border-red-500/40 light:text-red-600"
            >
              <Trash2 className="size-4" />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : subscription ? "Save Changes" : "Add subscription"}
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete subscription?"
        message="This removes it from Nova. It does not cancel the charge with the service."
        itemName={subscription?.service}
        confirmLabel="Delete"
      />
    </form>
  );
}
