"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/Calendar";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  createSubscriptionApi,
  deleteSubscriptionApi,
  listSubscriptionsApi,
  updateSubscriptionApi,
} from "@/lib/api/subscriptions";
import { cn } from "@/lib/cn";
import {
  dateInputToIso,
  EMPTY_SUBSCRIPTION_TOTALS,
  formatChargeDate,
  formatMoney,
  formatMoneyList,
  normalizeSubscriptionList,
  subscriptionHref,
  toDateInputValue,
  type Subscription,
  type SubscriptionIntervalUnit,
  type SubscriptionStatus,
  type SubscriptionTotals,
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

function SubscriptionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const [items, setItems] = useState<Subscription[]>([]);
  const [totals, setTotals] = useState<SubscriptionTotals>(EMPTY_SUBSCRIPTION_TOTALS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);

  if (hiddenId && hiddenId !== requestedId) {
    setHiddenId(null);
  }

  const load = useCallback(async () => {
    try {
      const data = normalizeSubscriptionList(await listSubscriptionsApi());
      setItems(data.items);
      setTotals(data.totals);
      setLoadError("");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not load subscriptions.";
      setLoadError(message);
      toast({
        variant: "error",
        title: "Could not load subscriptions",
        message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const linked =
    requestedId && hiddenId !== requestedId
      ? (items.find((item) => item.id === requestedId) ?? null)
      : null;
  const editing = creating ? null : (selected ?? linked);
  const drawerOpen = creating || Boolean(editing);

  const { activeItems, endedItems } = useMemo(() => {
    const ended = items.filter(
      (item) => item.status === "PAUSED" || item.status === "CANCELED",
    );
    const active = items.filter(
      (item) => item.status !== "PAUSED" && item.status !== "CANCELED",
    );
    const byCharge = (list: Subscription[]) =>
      list.slice().sort((a, b) => a.daysUntilCharge - b.daysUntilCharge);
    return { activeItems: byCharge(active), endedItems: byCharge(ended) };
  }, [items]);

  const due = formatMoneyList(totals.dueIn30Days);
  const yearly = formatMoneyList(totals.yearly);

  function closeDrawer() {
    if (requestedId) setHiddenId(requestedId);
    setCreating(false);
    setSelected(null);
    if (requestedId) router.replace("/subscriptions", { scroll: false });
  }

  function openCreate() {
    setCreating(true);
    setSelected(null);
    if (requestedId) {
      setHiddenId(requestedId);
      router.replace("/subscriptions", { scroll: false });
    }
  }

  function openEdit(item: Subscription) {
    setCreating(false);
    setSelected(item);
    setHiddenId(null);
    router.replace(subscriptionHref(item.id), { scroll: false });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-primary/60">
            Track renewals, trials, and what you pay.
          </p>
        </div>
        <Button variant="accent" onClick={openCreate}>
          Add subscription
        </Button>
      </div>

      {loading ? (
        <SubscriptionsSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Due in 30 days" value={due.value} detail={due.rest} />
            <SummaryCard label="Yearly cost" value={yearly.value} detail={yearly.rest} />
            <SummaryCard label="Active" value={String(totals.activeCount)} />
          </div>

          {loadError ? (
            <p className="text-sm text-danger" role="alert">
              {loadError}
            </p>
          ) : null}

          {!loadError && items.length === 0 ? (
            <GlassCard className="flex flex-col items-start gap-3">
              <p className="text-base font-medium text-primary">No subscriptions yet</p>
              <p className="text-sm text-primary/55">
                Add Cursor, Gemini, or anything else you pay for.
              </p>
              <Button variant="accent" onClick={openCreate}>
                Add subscription
              </Button>
            </GlassCard>
          ) : null}

          {activeItems.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary/45">
                Upcoming
              </h2>
              {activeItems.map((item) => (
                <SubscriptionRow key={item.id} item={item} onOpen={openEdit} />
              ))}
            </section>
          ) : null}

          {endedItems.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary/45">
                Ended
              </h2>
              {endedItems.map((item) => (
                <SubscriptionRow key={item.id} item={item} onOpen={openEdit} quiet />
              ))}
            </section>
          ) : null}
        </>
      )}

      <SideDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit subscription" : "Add subscription"}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {drawerOpen ? (
          <SubscriptionForm
            key={editing?.id ?? "new"}
            subscription={editing}
            onSaved={async () => {
              closeDrawer();
              await load();
            }}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <GlassCard className="h-full border-glass">
      <p className="text-sm text-primary/60">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-accent">{value}</p>
      {detail ? <p className="mt-1 text-[11px] text-primary/45">{detail}</p> : null}
    </GlassCard>
  );
}

function statusLabel(status: SubscriptionStatus): string {
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

function SubscriptionRow({
  item,
  quiet,
  onOpen,
}: {
  item: Subscription;
  quiet?: boolean;
  onOpen: (item: Subscription) => void;
}) {
  const dueSoon =
    item.inWarningWindow && (item.status === "ACTIVE" || item.status === "TRIAL");

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-center justify-between gap-6 rounded-2xl border border-glass bg-glass-card px-5 py-5 text-left outline-none transition-colors hover:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent/50",
        quiet && "opacity-70",
      )}
    >
      <span className="min-w-0 border-l-2 border-accent pl-4">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-lg font-semibold text-primary">
            {item.service}
          </span>
          {item.status !== "ACTIVE" ? (
            <span className="rounded-full border border-glass px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/55">
              {statusLabel(item.status)}
            </span>
          ) : null}
          {dueSoon ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              {item.status === "TRIAL" ? "Trial ending" : "Due soon"}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-sm text-primary/55">
          {[item.plan, item.reason?.trim()].filter(Boolean).join(" · ") || "No plan"}
        </span>
        <span className="mt-2 block text-xs text-primary/45">
          {formatChargeDate(item.nextChargeAt)}
          {item.lastCancelBy ? ` · Cancel by ${formatChargeDate(item.lastCancelBy)}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-lg font-semibold text-accent">
          {formatMoney(item.amount, item.currency)}
        </span>
        {item.previousPrice ? (
          <span className="mt-1 block text-[11px] text-primary/40">
            was {formatMoney(item.previousPrice.amount, item.previousPrice.currency)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SubscriptionsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <GlassCard key={index}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-24" />
          </GlassCard>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between rounded-2xl border border-glass bg-glass-card px-5 py-4"
        >
          <div className="flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
            <Skeleton className="mt-3 h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
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
    </div>
  );
}

function SubscriptionForm({
  subscription,
  onSaved,
}: {
  subscription: Subscription | null;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() =>
    subscription ? formFromSubscription(subscription) : EMPTY_FORM,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const busy = saving || deleting;

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
      setError("Currency must be 3 letters.");
      return;
    }
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError("Amount must be a number.");
      return;
    }
    const intervalCount = Math.trunc(Number(form.intervalCount));
    if (!Number.isFinite(intervalCount) || intervalCount < 1) {
      setError("Interval count must be at least 1.");
      return;
    }
    const reminderDays = Math.trunc(Number(form.reminderDays));
    if (!Number.isFinite(reminderDays) || reminderDays < 0) {
      setError("Reminder days must be zero or more.");
      return;
    }
    const nextChargeAt = dateInputToIso(form.nextChargeAt);
    if (!nextChargeAt) {
      const message = "Next charge date is invalid.";
      setError(message);
      toast({ variant: "error", title: "Check the date", message });
      return;
    }
    if (isBeforeToday(form.nextChargeAt)) {
      const message =
        "Next charge date cannot be in the past. Choose today or a later date.";
      setError(message);
      toast({ variant: "error", title: "Check the date", message });
      return;
    }
    const trialEndsAt = form.trialEndsAt.trim()
      ? dateInputToIso(form.trialEndsAt)
      : null;
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
      const message =
        err instanceof ApiError ? err.message : "Could not save this subscription.";
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
      const message =
        err instanceof ApiError ? err.message : "Could not delete this subscription.";
      setError(message);
      toast({
        variant: "error",
        title: "Delete failed",
        message,
      });
      return;
    } finally {
      setDeleting(false);
    }
    await onSaved();
  }

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <Field label="Service" htmlFor="subscription-service">
        <Input
          id="subscription-service"
          variant="soft"
          value={form.service}
          onChange={(event) => update("service", event.target.value)}
          placeholder="Netflix"
          required
        />
      </Field>
      <Field label="Plan" htmlFor="subscription-plan">
        <Input
          id="subscription-plan"
          variant="soft"
          value={form.plan}
          onChange={(event) => update("plan", event.target.value)}
          placeholder="Standard"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
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
          <Input
            id="subscription-currency"
            variant="soft"
            value={form.currency}
            maxLength={3}
            onChange={(event) =>
              update(
                "currency",
                event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase(),
              )
            }
            placeholder="USD"
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cycle" htmlFor="subscription-cycle">
          <Select
            id="subscription-cycle"
            variant="glass"
            aria-label="Billing cycle"
            value={form.intervalUnit}
            onChange={(value) => update("intervalUnit", value as SubscriptionIntervalUnit)}
            options={[
              { value: "DAY", label: "Day" },
              { value: "WEEK", label: "Week" },
              { value: "MONTH", label: "Month" },
              { value: "YEAR", label: "Year" },
            ]}
          />
        </Field>
        <Field label="Interval count" htmlFor="subscription-interval-count">
          <Input
            id="subscription-interval-count"
            variant="soft"
            type="number"
            min={1}
            step={1}
            value={form.intervalCount}
            onChange={(event) => update("intervalCount", event.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next charge date" htmlFor="subscription-next-charge">
          <DatePicker
            id="subscription-next-charge"
            aria-label="Next charge date"
            placeholder="Select date"
            value={dateFromKey(form.nextChargeAt)}
            onChange={(date) => update("nextChargeAt", keyFromDate(date))}
          />
        </Field>
        <Field label="Trial end" htmlFor="subscription-trial-end">
          <DatePicker
            id="subscription-trial-end"
            aria-label="Trial end"
            placeholder="No trial"
            value={dateFromKey(form.trialEndsAt)}
            onChange={(date) => update("trialEndsAt", keyFromDate(date))}
          />
        </Field>
      </div>
      <Field label="Status" htmlFor="subscription-status">
        <Select
          id="subscription-status"
          variant="glass"
          aria-label="Status"
          value={form.status}
          onChange={(value) => update("status", value as SubscriptionStatus)}
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "TRIAL", label: "Trial" },
            { value: "PAUSED", label: "Paused" },
            { value: "CANCELED", label: "Canceled" },
          ]}
        />
      </Field>
      <Field label="Reason" htmlFor="subscription-reason">
        <Input
          id="subscription-reason"
          variant="soft"
          value={form.reason}
          onChange={(event) => update("reason", event.target.value)}
          placeholder="Why you keep it"
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reminder days" htmlFor="subscription-reminder">
          <Input
            id="subscription-reminder"
            variant="soft"
            type="number"
            min={0}
            step={1}
            value={form.reminderDays}
            onChange={(event) => update("reminderDays", event.target.value)}
          />
        </Field>
        <Field label="Payment label" htmlFor="subscription-payment">
          <Input
            id="subscription-payment"
            variant="soft"
            value={form.paymentLabel}
            onChange={(event) => update("paymentLabel", event.target.value)}
            placeholder="Visa · 4242"
          />
        </Field>
      </div>
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
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
      </div>
      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete subscription?"
        itemName={subscription?.service}
        confirmLabel="Delete"
      />
    </form>
  );
}

function isBeforeToday(value: string) {
  const chosen = dateFromKey(value);
  if (!chosen) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return chosen.getTime() < today.getTime();
}

function dateFromKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function keyFromDate(date: Date | null) {
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function SubscriptionsFallback() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <GlassCard key={index}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-24" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

export default function SubscriptionsPageRoute() {
  return (
    <Suspense fallback={<SubscriptionsFallback />}>
      <SubscriptionsPage />
    </Suspense>
  );
}
