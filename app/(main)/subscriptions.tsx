import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  createSubscriptionApi,
  deleteSubscriptionApi,
  DEMO_SUBSCRIPTION_MESSAGE,
  listSubscriptionsApi,
  updateSubscriptionApi,
  type Subscription,
  type SubscriptionIntervalUnit,
  type SubscriptionStatus,
  type SubscriptionTotals,
  type SubscriptionWriteInput,
} from "@/api/subscriptions";
import { BottomDrawer } from "@/components/BottomDrawer";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { CalendarField } from "@/components/CalendarField";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { InlineMessage } from "@/components/InlineMessage";
import { SelectField } from "@/components/SelectField";
import { Skeleton, SkeletonLine } from "@/components/Skeleton";
import { TextLink } from "@/components/TextLink";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import {
  chargeTimingLabel,
  dateKeyFromIso,
  dateKeyToIso,
  formatMoney,
  formatMoneyList,
  formatSubscriptionDate,
  intervalLabel,
  isHttpUrl,
  parseSubscriptionAmount,
} from "@/subscriptions";
import { getPalette } from "@/theme/colors";

type DrawerMode = "create" | "edit";

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

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_TOTALS: SubscriptionTotals = {
  dueIn30Days: [],
  yearly: [],
  activeCount: 0,
};

const INTERVAL_OPTIONS = [
  { value: "DAY", label: "Daily" },
  { value: "WEEK", label: "Weekly" },
  { value: "MONTH", label: "Monthly" },
  { value: "YEAR", label: "Yearly" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRIAL", label: "Trial" },
  { value: "PAUSED", label: "Paused" },
  { value: "CANCELED", label: "Canceled" },
];

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  TRIAL: "Trial",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

function emptyForm(): FormState {
  return {
    service: "",
    plan: "",
    amount: "",
    currency: "",
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
}

function formFromSubscription(subscription: Subscription): FormState {
  return {
    service: subscription.service ?? "",
    plan: subscription.plan ?? "",
    amount: subscription.amount ?? "",
    currency: subscription.currency ?? "",
    intervalUnit: subscription.intervalUnit ?? "MONTH",
    intervalCount: String(subscription.intervalCount ?? 1),
    nextChargeAt: dateKeyFromIso(subscription.nextChargeAt),
    trialEndsAt: dateKeyFromIso(subscription.trialEndsAt),
    status: subscription.status ?? "ACTIVE",
    reason: subscription.reason ?? "",
    cancelUrl: subscription.cancelUrl ?? "",
    reminderDays: String(subscription.reminderDays ?? 3),
    paymentLabel: subscription.paymentLabel ?? "",
  };
}

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function wholeNumber(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function subscriptionErrorMessage(error: unknown, fallback: string) {
  const message = getApiErrorMessage(error, fallback);
  if (message === DEMO_SUBSCRIPTION_MESSAGE || /demo account/i.test(message)) {
    return DEMO_SUBSCRIPTION_MESSAGE;
  }
  return message;
}

function isBeforeToday(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const chosen = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return chosen.getTime() < today.getTime();
}

function validateForm(form: FormState) {
  const errors: FormErrors = {};
  if (!form.service.trim()) errors.service = "Service is required.";
  if (!parseSubscriptionAmount(form.amount)) {
    errors.amount = "Enter an amount greater than zero, like 20.00.";
  }
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    errors.currency = "Use a 3-letter code, like USD.";
  }
  if (!form.nextChargeAt) errors.nextChargeAt = "Choose the next charge date.";
  else if (isBeforeToday(form.nextChargeAt)) {
    errors.nextChargeAt =
      "Next charge date cannot be in the past. Choose today or a later date.";
  }
  if (form.intervalCount.trim()) {
    const count = wholeNumber(form.intervalCount);
    if (count == null || count < 1) {
      errors.intervalCount = "Use a whole number of 1 or more.";
    }
  }
  if (form.reminderDays.trim()) {
    const days = wholeNumber(form.reminderDays);
    if (days == null) errors.reminderDays = "Use a whole number of days, or leave it blank.";
  }
  if (form.cancelUrl.trim() && !isHttpUrl(form.cancelUrl)) {
    errors.cancelUrl = "Enter a link that starts with http:// or https://.";
  }
  return errors;
}

function formToPayload(form: FormState, mode: DrawerMode): SubscriptionWriteInput {
  const amount = parseSubscriptionAmount(form.amount) ?? form.amount.trim();
  const parsedCount = wholeNumber(form.intervalCount);
  const intervalCount = parsedCount != null && parsedCount >= 1 ? parsedCount : 1;
  const reminderDays = form.reminderDays.trim() ? Number(form.reminderDays) : 3;
  const optional = {
    plan: form.plan.trim() || null,
    trialEndsAt: form.trialEndsAt ? dateKeyToIso(form.trialEndsAt) : null,
    reason: form.reason.trim() || null,
    cancelUrl: form.cancelUrl.trim() || null,
    paymentLabel: form.paymentLabel.trim() || null,
  };
  const payload: SubscriptionWriteInput = {
    service: form.service.trim(),
    amount,
    currency: form.currency.trim().toUpperCase(),
    intervalUnit: form.intervalUnit,
    intervalCount,
    nextChargeAt: dateKeyToIso(form.nextChargeAt),
    status: form.status,
    reminderDays,
  };
  if (mode === "edit") return { ...payload, ...optional };
  if (optional.plan) payload.plan = optional.plan;
  if (optional.trialEndsAt) payload.trialEndsAt = optional.trialEndsAt;
  if (optional.reason) payload.reason = optional.reason;
  if (optional.cancelUrl) payload.cancelUrl = optional.cancelUrl;
  if (optional.paymentLabel) payload.paymentLabel = optional.paymentLabel;
  return payload;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text className="mt-1.5 text-xs leading-[17px] text-danger dark:text-dark-danger">
      {message}
    </Text>
  );
}

function SubscriptionsSkeleton() {
  return (
    <View className="flex-1 gap-5 bg-main p-5 dark:bg-dark-main">
      <View className="flex-row items-center justify-between">
        <View className="gap-2">
          <SkeletonLine className="h-7 w-40" />
          <SkeletonLine className="w-56" />
        </View>
        <Skeleton className="h-12 w-12 rounded-nova" />
      </View>
      <View className="gap-4 rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-2/3" />
      </View>
      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          className="gap-3 rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar"
        >
          <View className="flex-row items-center justify-between">
            <SkeletonLine className="h-5 w-28" />
            <SkeletonLine className="h-5 w-16" />
          </View>
          <SkeletonLine className="w-40" />
          <SkeletonLine className="w-52" />
        </View>
      ))}
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="text-xs font-extrabold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
        {label}
      </Text>
      <Text className="flex-1 text-right text-[16px] font-black text-accent dark:text-dark-accent">
        {value}
      </Text>
    </View>
  );
}

function SubscriptionRow({
  item,
  quiet,
  onEdit,
  onDelete,
}: {
  item: Subscription;
  quiet?: boolean;
  onEdit: (item: Subscription) => void;
  onDelete: (item: Subscription) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const timing = chargeTimingLabel(item.status, item.daysUntilCharge);
  const planLine = [item.plan, intervalLabel(item.intervalUnit, item.intervalCount)]
    .filter(Boolean)
    .join(" · ");
  const warning =
    item.inWarningWindow && (item.status === "ACTIVE" || item.status === "TRIAL");

  return (
    <View
      className={`rounded-nova-xl border bg-sidebar p-5 dark:bg-dark-sidebar ${
        warning
          ? "border-warning/60 dark:border-dark-warning/60"
          : "border-glass dark:border-dark-glass"
      } ${quiet ? "opacity-80" : ""}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
            {item.service}
          </Text>
          {planLine ? (
            <Text className="mt-1 text-sm text-muted dark:text-dark-muted">{planLine}</Text>
          ) : null}
        </View>
        <Text className="text-[18px] font-black text-accent dark:text-dark-accent">
          {formatMoney(item.amount, item.currency)}
        </Text>
      </View>

      <Text className="mt-3 text-sm text-muted dark:text-dark-muted">
        {formatSubscriptionDate(item.nextChargeAt) || "No date"}
        {item.lastCancelBy
          ? ` · Cancel by ${formatSubscriptionDate(item.lastCancelBy)}`
          : ""}
        {timing ? ` · ${timing}` : ""}
      </Text>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        {item.status !== "ACTIVE" ? (
          <Text className="rounded-full border border-glass px-2 py-1 text-[10px] font-black text-muted dark:border-dark-glass dark:text-dark-muted">
            {STATUS_LABEL[item.status] ?? item.status}
          </Text>
        ) : null}
        {warning ? (
          <Text className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-black text-warning dark:border-dark-warning/40 dark:bg-dark-warning/10 dark:text-dark-warning">
            {item.status === "TRIAL" ? "Trial ending" : "Due soon"}
          </Text>
        ) : null}
      </View>

      {item.previousPrice ? (
        <Text className="mt-3 text-xs text-subtle dark:text-dark-subtle">
          Was {formatMoney(item.previousPrice.amount, item.previousPrice.currency)}
        </Text>
      ) : null}
      {item.reason ? (
        <Text
          numberOfLines={1}
          className="mt-2 text-sm text-muted dark:text-dark-muted"
        >
          {item.reason}
        </Text>
      ) : null}
      {item.paymentLabel ? (
        <Text className="mt-1 text-xs text-subtle dark:text-dark-subtle">
          {item.paymentLabel}
        </Text>
      ) : null}
      {isHttpUrl(item.cancelUrl) ? (
        <View className="mt-3">
          <TextLink
            label="Cancel page"
            onPress={() => {
              const url = item.cancelUrl?.trim();
              if (url) void Linking.openURL(url);
            }}
          />
        </View>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.service}`}
          onPress={() => onEdit(item)}
          className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
        >
          <Ionicons name="create-outline" size={17} color={palette.accent} />
          <Text className="text-sm font-extrabold text-muted dark:text-dark-muted">
            Edit
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.service}`}
          onPress={() => onDelete(item)}
          className="min-h-[44px] w-[52px] items-center justify-center rounded-nova border border-danger/40 bg-danger/10 active:opacity-75 dark:border-dark-danger/40 dark:bg-dark-danger/10"
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function SubscriptionDrawer({
  visible,
  mode,
  subscription,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: DrawerMode;
  subscription: Subscription | null;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: SubscriptionWriteInput) => Promise<void>;
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!visible) return;
    setForm(subscription ? formFromSubscription(subscription) : emptyForm());
    setErrors({});
  }, [subscription, visible]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (submitting) return;
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit(formToPayload(form, mode));
  };

  return (
    <BottomDrawer
      visible={visible}
      title={isEdit ? "Edit subscription" : "Add subscription"}
      subtitle={
        isEdit
          ? "Update the price, date, or cancel link."
          : "Service, price, cycle, and the next charge."
      }
      closeDisabled={submitting}
      onClose={onClose}
    >
      {error ? <InlineMessage message={error} /> : null}

      <FormField
        label="Service"
        value={form.service}
        onChangeText={(value) => setField("service", value)}
        placeholder="Cursor"
        error={errors.service}
      />
      <FormField
        label="Plan"
        value={form.plan}
        onChangeText={(value) => setField("plan", value)}
        placeholder="Pro"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField
            label="Amount"
            value={form.amount}
            onChangeText={(value) => setField("amount", value)}
            placeholder="20.00"
            keyboardType="decimal-pad"
            error={errors.amount}
          />
        </View>
        <View className="w-[108px]">
          <FormField
            label="Currency"
            value={form.currency}
            onChangeText={(value) => setField("currency", value.toUpperCase())}
            placeholder="USD"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            error={errors.currency}
          />
        </View>
      </View>

      <SelectField
        label="Billing cycle"
        value={form.intervalUnit}
        options={INTERVAL_OPTIONS}
        onChange={(value) => setField("intervalUnit", value as SubscriptionIntervalUnit)}
        title="Billing cycle"
        subtitle="How often this charge repeats."
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField
            label="Every"
            value={form.intervalCount}
            onChangeText={(value) => setField("intervalCount", value.replace(/[^\d]/g, ""))}
            placeholder="1"
            keyboardType="number-pad"
            hint={intervalLabel(
              form.intervalUnit,
              form.intervalCount.trim() ? Number(form.intervalCount) : 1,
            )}
            error={errors.intervalCount}
          />
        </View>
        <View className="flex-1">
          <FormField
            label="Remind me"
            value={form.reminderDays}
            onChangeText={(value) => setField("reminderDays", value.replace(/[^\d]/g, ""))}
            placeholder="3"
            keyboardType="number-pad"
            hint="Days before the charge."
            error={errors.reminderDays}
          />
        </View>
      </View>

      <View className="gap-[7px]">
        <Text className="text-[13px] font-bold text-muted dark:text-dark-muted">
          Next charge
        </Text>
        <CalendarField
          value={form.nextChargeAt}
          onChange={(value) => setField("nextChargeAt", value)}
          placeholder="Select date"
          drawerTitle="Next charge"
          drawerSubtitle="When this subscription bills next."
        />
        <FieldError message={errors.nextChargeAt} />
      </View>

      <View className="gap-[7px]">
        <Text className="text-[13px] font-bold text-muted dark:text-dark-muted">
          Trial ends
        </Text>
        <CalendarField
          value={form.trialEndsAt}
          onChange={(value) => setField("trialEndsAt", value)}
          placeholder="No trial"
          drawerTitle="Trial ends"
          drawerSubtitle="Leave empty if there is no trial."
        />
      </View>

      <SelectField
        label="Status"
        value={form.status}
        options={STATUS_OPTIONS}
        onChange={(value) => setField("status", value as SubscriptionStatus)}
        title="Status"
        subtitle="Active, trial, paused, or canceled."
      />

      <FormField
        label="Why you keep it"
        value={form.reason}
        onChangeText={(value) => setField("reason", value)}
        placeholder="Needed for the team"
        multiline
        textAlignVertical="top"
      />
      <FormField
        label="Cancel link"
        value={form.cancelUrl}
        onChangeText={(value) => setField("cancelUrl", value)}
        placeholder="https://"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={errors.cancelUrl}
      />
      <FormField
        label="Payment label"
        value={form.paymentLabel}
        onChangeText={(value) => setField("paymentLabel", value)}
        placeholder="Card ending 4242"
      />

      <View className="flex-row gap-3 pt-1">
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={onClose}
          className="min-h-[50px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-card active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <Text className="text-[15px] font-extrabold text-muted dark:text-dark-muted">
            Cancel
          </Text>
        </Pressable>
        <PrimaryButton
          label={submitting ? "Saving..." : isEdit ? "Save changes" : "Add subscription"}
          loading={submitting}
          disabled={submitting}
          onPress={() => {
            void submit();
          }}
          className="flex-1"
        />
      </View>
    </BottomDrawer>
  );
}

export default function SubscriptionsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const isDemo = Boolean(useAuthStore((state) => state.user?.isDemo));
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [items, setItems] = useState<Subscription[]>([]);
  const [totals, setTotals] = useState<SubscriptionTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState(false);
  const openedFor = useRef("");

  const loadSubscriptions = useCallback(async () => {
    try {
      const data = await listSubscriptionsApi();
      setItems(data.items);
      setTotals(data.totals);
      setPageError("");
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load subscriptions",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const requestedId = firstParam(params.id);

  useEffect(() => {
    if (!requestedId || loading || openedFor.current === requestedId) return;
    const match = items.find((item) => item.id === requestedId);
    openedFor.current = requestedId;
    if (!match) return;
    setDrawerMode("edit");
    setEditing(match);
    setSubmitError("");
    setDrawerOpen(true);
  }, [items, loading, requestedId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscriptions();
    setRefreshing(false);
  }, [loadSubscriptions]);

  const current = useMemo(
    () => items.filter((item) => item.status === "ACTIVE" || item.status === "TRIAL"),
    [items],
  );
  const ended = useMemo(
    () => items.filter((item) => item.status === "PAUSED" || item.status === "CANCELED"),
    [items],
  );

  const openCreate = () => {
    setDrawerMode("create");
    setEditing(null);
    setSubmitError("");
    setDrawerOpen(true);
  };

  const openEdit = (item: Subscription) => {
    setDrawerMode("edit");
    setEditing(item);
    setSubmitError("");
    setDrawerOpen(true);
  };

  const handleSubmit = async (input: SubscriptionWriteInput) => {
    if (isDemo) {
      setSubmitError(DEMO_SUBSCRIPTION_MESSAGE);
      setPageError(DEMO_SUBSCRIPTION_MESSAGE);
      showSnackbar({
        variant: "error",
        title: drawerMode === "edit" ? "Update failed" : "Could not add subscription",
        message: DEMO_SUBSCRIPTION_MESSAGE,
      });
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      if (drawerMode === "edit" && editing) {
        await updateSubscriptionApi(editing.id, input);
      } else {
        await createSubscriptionApi(input);
      }
      await loadSubscriptions();
      setDrawerOpen(false);
      showSnackbar({
        variant: "success",
        title: drawerMode === "edit" ? "Subscription updated" : "Subscription added",
        message:
          drawerMode === "edit"
            ? `${input.service} was saved.`
            : `${input.service} is on your list.`,
      });
    } catch (error) {
      const message = subscriptionErrorMessage(
        error,
        "Could not save the subscription.",
      );
      setSubmitError(message);
      setPageError(message);
      showSnackbar({
        variant: "error",
        title: drawerMode === "edit" ? "Update failed" : "Could not add subscription",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (isDemo) {
      setPageError(DEMO_SUBSCRIPTION_MESSAGE);
      setDeleteTarget(null);
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message: DEMO_SUBSCRIPTION_MESSAGE,
      });
      return;
    }
    setDeleting(true);
    try {
      await deleteSubscriptionApi(deleteTarget.id);
      if (editing?.id === deleteTarget.id) setDrawerOpen(false);
      await loadSubscriptions();
      showSnackbar({
        variant: "success",
        title: "Subscription removed",
        message: `${deleteTarget.service} was deleted.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      const message = subscriptionErrorMessage(
        error,
        "Could not delete the subscription.",
      );
      setPageError(message);
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message,
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <SubscriptionsSkeleton />;

  const dueLabel = formatMoneyList(totals?.dueIn30Days) || "Nothing due";
  const yearlyLabel = formatMoneyList(totals?.yearly) || "—";

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-32"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
              Subscriptions
            </Text>
            <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
              What you pay for, and when it charges next.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add subscription"
            onPress={openCreate}
            className="h-12 w-12 items-center justify-center rounded-nova bg-accent active:bg-accent-pressed dark:bg-dark-accent"
          >
            <Ionicons name="add-outline" size={26} color={palette.white} />
          </Pressable>
        </View>

        {isDemo || pageError === DEMO_SUBSCRIPTION_MESSAGE ? (
          <InlineMessage message={DEMO_SUBSCRIPTION_MESSAGE} />
        ) : null}
        {pageError && pageError !== DEMO_SUBSCRIPTION_MESSAGE ? (
          <InlineMessage message={pageError} />
        ) : null}

        <View className="gap-4 rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <SummaryLine label="Due in 30 days" value={dueLabel} />
          <SummaryLine label="Yearly cost" value={yearlyLabel} />
          <SummaryLine label="Active" value={String(totals?.activeCount ?? 0)} />
        </View>

        {items.length === 0 ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Text className="text-center text-[16px] font-black text-primary dark:text-dark-primary">
              You have no subscriptions yet.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add subscription"
              onPress={openCreate}
              className="mt-4 rounded-full border border-accent/50 bg-accent/10 px-4 py-2"
            >
              <Text className="text-sm font-black text-accent dark:text-dark-accent">
                Add subscription
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-5">
            {current.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                No upcoming charges.
              </Text>
            ) : (
              <View className="gap-4">
                {current.map((item) => (
                  <SubscriptionRow
                    key={item.id}
                    item={item}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </View>
            )}

            {ended.length > 0 ? (
              <View className="gap-3">
                <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
                  Ended
                </Text>
                <View className="gap-4">
                  {ended.map((item) => (
                    <SubscriptionRow
                      key={item.id}
                      item={item}
                      quiet
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <SubscriptionDrawer
        visible={drawerOpen}
        mode={drawerMode}
        subscription={editing}
        submitting={submitting}
        error={submitError || (isDemo ? DEMO_SUBSCRIPTION_MESSAGE : "")}
        onClose={() => {
          if (!submitting) setDrawerOpen(false);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmationPopup
        visible={Boolean(deleteTarget)}
        title="Delete subscription?"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.service} from your list. This does not cancel it with the service.`
            : ""
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        variant="danger"
        icon="trash-outline"
        loading={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </View>
  );
}
