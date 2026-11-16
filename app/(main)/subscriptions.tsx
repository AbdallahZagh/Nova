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
  getSubscriptionApi,
  listSubscriptionsApi,
  renewAllSubscriptionsApi,
  renewSubscriptionApi,
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
  applyQuickAction,
  canMarkRenewed,
  dateKeyFromIso,
  dateKeyToIso,
  EMPTY_SUBSCRIPTION_TOTALS,
  formatMoney,
  formatMoneyList,
  formatSubscriptionDate,
  intervalLabel,
  isHttpUrl,
  isLiveSubscription,
  isOverdueSubscription,
  isStoppedSubscription,
  parseSubscriptionAmount,
  statusLabel,
  subscriptionTimingLabel,
  type SubscriptionQuickAction,
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

type ListFilter = "all" | "renewing" | "trials" | "overdue" | "stopped";

const FILTER_IDS: ListFilter[] = ["all", "renewing", "trials", "overdue", "stopped"];

const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "INR",
  "EGP",
  "AED",
  "SAR",
];

const OTHER_CURRENCY = "OTHER";

const CURRENCY_OPTIONS = [
  ...COMMON_CURRENCIES.map((code) => ({ value: code, label: code })),
  { value: OTHER_CURRENCY, label: "Other…" },
];

function periodOptions(count: number) {
  const plural = count === 1 ? "" : "s";
  return [
    { value: "DAY", label: `day${plural}` },
    { value: "WEEK", label: `week${plural}` },
    { value: "MONTH", label: `month${plural}` },
    { value: "YEAR", label: `year${plural}` },
  ];
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRIAL", label: "Trial" },
  { value: "PAUSED", label: "Paused" },
  { value: "CANCELED", label: "Canceled" },
];

function emptyForm(): FormState {
  return {
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

function validateForm(form: FormState, savedDate = "") {
  const errors: FormErrors = {};
  if (!form.service.trim()) errors.service = "Service is required.";
  if (!parseSubscriptionAmount(form.amount)) {
    errors.amount = "Enter an amount greater than zero, like 20.00.";
  }
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    errors.currency = "Use a 3-letter code, like USD.";
  }
  if (!form.nextChargeAt) errors.nextChargeAt = "Choose the next charge date.";
  else if (form.nextChargeAt !== savedDate && isBeforeToday(form.nextChargeAt)) {
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
    if (days == null || days > 90) {
      errors.reminderDays = "Use a whole number of days between 0 and 90.";
    }
  }
  if (form.status === "TRIAL" && !form.trialEndsAt) {
    errors.trialEndsAt = "Choose the date the trial ends.";
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

function StatusPill({ status }: { status: SubscriptionStatus }) {
  const tone =
    status === "ACTIVE"
      ? "border-accent/40 bg-accent/10 text-accent dark:border-dark-accent/40 dark:bg-dark-accent/10 dark:text-dark-accent"
      : status === "TRIAL"
        ? "border-warning/40 bg-warning/10 text-warning dark:border-dark-warning/40 dark:bg-dark-warning/10 dark:text-dark-warning"
        : "border-glass bg-glass-button text-muted dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-muted";
  return (
    <Text className={`overflow-hidden rounded-full border px-2.5 py-1 text-[10px] font-black ${tone}`}>
      {statusLabel(status)}
    </Text>
  );
}

function RowAction({
  label,
  icon,
  primary,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-[40px] flex-row items-center justify-center gap-1.5 rounded-nova border px-3 active:opacity-75 ${
        primary
          ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
      }`}
    >
      <Ionicons name={icon} size={16} color={primary ? palette.white : palette.muted} />
      <Text
        className={`text-xs font-black ${
          primary ? "text-white" : "text-muted dark:text-dark-muted"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SubscriptionRow({
  item,
  quiet,
  onOpen,
  onAction,
}: {
  item: Subscription;
  quiet?: boolean;
  onOpen: (item: Subscription) => void;
  onAction: (item: Subscription, action: SubscriptionQuickAction) => void;
}) {
  const cadence = intervalLabel(item.intervalUnit, item.intervalCount);
  const timing = subscriptionTimingLabel(item);
  const overdue = isOverdueSubscription(item);
  const warning = !overdue && isLiveSubscription(item) && item.inWarningWindow;
  const timingTone = overdue
    ? "text-danger dark:text-dark-danger"
    : warning
      ? "text-warning dark:text-dark-warning"
      : "text-primary dark:text-dark-primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.service}`}
      onPress={() => onOpen(item)}
      className={`rounded-nova-xl border bg-sidebar p-5 active:opacity-80 dark:bg-dark-sidebar ${
        overdue
          ? "border-danger/50 dark:border-dark-danger/50"
          : warning
            ? "border-warning/50 dark:border-dark-warning/50"
            : "border-glass dark:border-dark-glass"
      } ${quiet ? "opacity-75" : ""}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
            {item.service}
          </Text>
          <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
            {item.plan?.trim() || cadence || "Subscription"}
          </Text>
        </View>
        <StatusPill status={item.status} />
      </View>

      <Text className="mt-5 text-[28px] font-black text-accent dark:text-dark-accent">
        {formatMoney(item.amount, item.currency)}
      </Text>
      {cadence ? (
        <Text className="mt-1 text-sm text-muted dark:text-dark-muted">{cadence}</Text>
      ) : null}

      <Text className={`mt-5 text-sm font-extrabold ${timingTone}`}>
        {timing || "No date"}
      </Text>
      <Text className="mt-1 text-xs text-subtle dark:text-dark-subtle">
        {formatSubscriptionDate(item.nextChargeAt) || "No date"}
        {isLiveSubscription(item) && item.lastCancelBy
          ? ` · Cancel by ${formatSubscriptionDate(item.lastCancelBy)}`
          : ""}
      </Text>

      {canMarkRenewed(item) || item.status === "PAUSED" || item.status === "CANCELED" ? (
        <View className="mt-4 flex-row gap-2">
          {canMarkRenewed(item) ? (
            <RowAction
              label="Mark renewed"
              icon="refresh-outline"
              primary={overdue}
              onPress={() => onAction(item, "renew")}
            />
          ) : null}
          {item.status === "PAUSED" ? (
            <RowAction
              label="Resume"
              icon="play-outline"
              primary
              onPress={() => onAction(item, "resume")}
            />
          ) : null}
          {item.status === "CANCELED" ? (
            <RowAction
              label="Reactivate"
              icon="arrow-undo-outline"
              onPress={() => onAction(item, "reactivate")}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-glass py-3 dark:border-dark-glass">
      <Text className="text-[11px] font-black uppercase tracking-[1.2px] text-subtle dark:text-dark-subtle">
        {label}
      </Text>
      <Text className="flex-1 text-right text-sm font-semibold text-primary dark:text-dark-primary">
        {value}
      </Text>
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
  const [showMore, setShowMore] = useState(false);
  const [customCurrency, setCustomCurrency] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const next = subscription ? formFromSubscription(subscription) : emptyForm();
    setForm(next);
    setErrors({});
    setCustomCurrency(!COMMON_CURRENCIES.includes(next.currency.trim().toUpperCase()));
    setShowMore(
      Boolean(next.reason.trim() || next.cancelUrl.trim() || next.paymentLabel.trim()),
    );
  }, [subscription, visible]);

  const intervalCount = Math.max(1, Number(form.intervalCount) || 1);
  const currencyChoice =
    customCurrency || !COMMON_CURRENCIES.includes(form.currency.trim().toUpperCase())
      ? OTHER_CURRENCY
      : form.currency.trim().toUpperCase();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (submitting) return;
    const nextErrors = validateForm(
      form,
      subscription ? dateKeyFromIso(subscription.nextChargeAt) : "",
    );
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
        <View className="w-[116px]">
          <SelectField
            label="Currency"
            value={currencyChoice}
            options={CURRENCY_OPTIONS}
            searchable
            searchPlaceholder="Search currency"
            title="Currency"
            subtitle="Pick one, or choose Other for a different code."
            onChange={(value) => {
              if (value === OTHER_CURRENCY) {
                setCustomCurrency(true);
                setField("currency", "");
              } else {
                setCustomCurrency(false);
                setField("currency", value);
              }
            }}
          />
        </View>
      </View>
      {currencyChoice === OTHER_CURRENCY ? (
        <FormField
          label="Currency code"
          value={form.currency}
          onChangeText={(value) =>
            setField("currency", value.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase())
          }
          placeholder="SEK"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          hint="Three letters, like SEK or BRL."
          error={errors.currency}
        />
      ) : null}

      <View className="flex-row items-end gap-3">
        <View className="w-[96px]">
          <FormField
            label="Repeats every"
            value={form.intervalCount}
            onChangeText={(value) => setField("intervalCount", value.replace(/[^\d]/g, ""))}
            placeholder="1"
            keyboardType="number-pad"
            error={errors.intervalCount}
          />
        </View>
        <View className="flex-1">
          <SelectField
            value={form.intervalUnit}
            options={periodOptions(intervalCount)}
            onChange={(value) => setField("intervalUnit", value as SubscriptionIntervalUnit)}
            title="Billing period"
            subtitle="How often this charge repeats."
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

      <SelectField
        label="Status"
        value={form.status}
        options={STATUS_OPTIONS}
        onChange={(value) => setField("status", value as SubscriptionStatus)}
        title="Status"
        subtitle="Active, trial, paused, or canceled."
      />

      {form.status === "TRIAL" ? (
        <View className="gap-[7px]">
          <Text className="text-[13px] font-bold text-muted dark:text-dark-muted">
            Trial ends
          </Text>
          <CalendarField
            value={form.trialEndsAt}
            onChange={(value) => setField("trialEndsAt", value)}
            placeholder="Select date"
            drawerTitle="Trial ends"
            drawerSubtitle="Nova reminds you before it turns into a paid plan."
          />
          <FieldError message={errors.trialEndsAt} />
        </View>
      ) : null}

      <FormField
        label="Remind me (days before)"
        value={form.reminderDays}
        onChangeText={(value) => setField("reminderDays", value.replace(/[^\d]/g, ""))}
        placeholder="3"
        keyboardType="number-pad"
        hint={
          form.reminderDays.trim() === "0"
            ? "No reminder before this charges."
            : "Nova notifies you this many days before the charge so you can cancel in time. Use 0 to turn it off."
        }
        error={errors.reminderDays}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowMore((open) => !open)}
        className="min-h-[44px] items-center justify-center rounded-nova border border-glass bg-glass-button active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
      >
        <Text className="text-sm font-extrabold text-muted dark:text-dark-muted">
          {showMore ? "Hide extra details" : "More details"}
        </Text>
      </Pressable>

      {showMore ? (
        <View className="gap-5">
      {form.status !== "TRIAL" ? (
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
      ) : null}

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
        </View>
      ) : null}

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
  const params = useLocalSearchParams<{ id?: string | string[]; filter?: string | string[] }>();
  const isDemo = Boolean(useAuthStore((state) => state.user?.isDemo));
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [items, setItems] = useState<Subscription[]>([]);
  const [totals, setTotals] = useState<SubscriptionTotals>(EMPTY_SUBSCRIPTION_TOTALS);
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
  const [detail, setDetail] = useState<Subscription | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [renewingAll, setRenewingAll] = useState(false);
  const openedFor = useRef("");
  const pending = useRef(0);

  const loadSubscriptions = useCallback(
    async (quiet = false) => {
      try {
        const data = await listSubscriptionsApi();
        setItems(data.items);
        setTotals(data.totals);
        setPageError("");
      } catch (error) {
        if (!quiet) {
          showSnackbar({
            variant: "error",
            title: "Could not load subscriptions",
            message: getApiErrorMessage(error, "Please try again."),
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [showSnackbar],
  );

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const requestedId = firstParam(params.id);
  const requestedFilter = firstParam(params.filter);

  useEffect(() => {
    if (FILTER_IDS.includes(requestedFilter as ListFilter)) {
      setFilter(requestedFilter as ListFilter);
    }
  }, [requestedFilter]);

  // A link can point at a subscription that is not in the list. Fetch it by id.
  useEffect(() => {
    if (!requestedId || loading || openedFor.current === requestedId) return;
    openedFor.current = requestedId;
    const match = items.find((item) => item.id === requestedId);
    if (match) {
      setDetail(match);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const found = await getSubscriptionApi(requestedId);
        if (!cancelled) setDetail(found);
      } catch {
        if (cancelled) return;
        showSnackbar({
          variant: "error",
          title: "Subscription not found",
          message: "It may have been deleted.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, loading, requestedId, showSnackbar]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscriptions();
    setRefreshing(false);
  }, [loadSubscriptions]);

  const overdueCount = useMemo(
    () => items.filter(isOverdueSubscription).length,
    [items],
  );
  const current = useMemo(() => {
    const live = items
      .filter(isLiveSubscription)
      .sort((a, b) => a.daysUntilCharge - b.daysUntilCharge);
    if (filter === "trials") return live.filter((item) => item.status === "TRIAL");
    if (filter === "renewing") return live.filter((item) => item.status === "ACTIVE");
    if (filter === "overdue") return live.filter(isOverdueSubscription);
    if (filter === "stopped") return [];
    return live;
  }, [filter, items]);
  const ended = useMemo(() => {
    if (filter === "renewing" || filter === "trials" || filter === "overdue") return [];
    return items
      .filter(isStoppedSubscription)
      .sort((a, b) => a.daysUntilCharge - b.daysUntilCharge);
  }, [filter, items]);

  const replaceItem = useCallback((next: Subscription) => {
    setItems((list) => list.map((row) => (row.id === next.id ? next : row)));
    setDetail((open) => (open && open.id === next.id ? next : open));
  }, []);

  // The row changes right away; the server answer replaces it, and a failure puts it back.
  const runAction = async (item: Subscription, action: SubscriptionQuickAction) => {
    if (isDemo) {
      showSnackbar({
        variant: "error",
        title: "That did not work",
        message: DEMO_SUBSCRIPTION_MESSAGE,
      });
      return;
    }
    replaceItem(applyQuickAction(item, action));
    pending.current += 1;
    try {
      const saved =
        action === "renew"
          ? await renewSubscriptionApi(item.id)
          : await updateSubscriptionApi(item.id, {
              status: action === "pause" ? "PAUSED" : "ACTIVE",
            });
      if (saved && typeof saved.id === "string") replaceItem(saved);
      showSnackbar({
        variant: "success",
        title:
          action === "renew"
            ? "Marked as renewed"
            : action === "pause"
              ? "Paused"
              : action === "resume"
                ? "Resumed"
                : "Reactivated",
        message:
          action === "renew"
            ? `${item.service} charges next on ${formatSubscriptionDate(saved?.nextChargeAt)}.`
            : action === "pause"
              ? `${item.service} will not remind you until you resume it.`
              : `${item.service} is active again.`,
      });
    } catch (error) {
      replaceItem(item);
      showSnackbar({
        variant: "error",
        title: "That did not work",
        message: subscriptionErrorMessage(error, "Could not update this subscription."),
      });
    } finally {
      pending.current = Math.max(0, pending.current - 1);
      if (pending.current === 0) void loadSubscriptions(true);
    }
  };

  const renewAll = async () => {
    if (renewingAll || overdueCount === 0) return;
    if (isDemo) {
      showSnackbar({
        variant: "error",
        title: "That did not work",
        message: DEMO_SUBSCRIPTION_MESSAGE,
      });
      return;
    }
    const before = items;
    setRenewingAll(true);
    setItems((list) =>
      list.map((row) => (isOverdueSubscription(row) ? applyQuickAction(row, "renew") : row)),
    );
    try {
      const result = await renewAllSubscriptionsApi();
      setItems(result.items);
      setTotals(result.totals);
      setFilter((open) => (open === "overdue" ? "all" : open));
      showSnackbar({
        variant: "success",
        title: "Renewed",
        message:
          result.renewed === 1
            ? "1 subscription moved to its next charge date."
            : `${result.renewed} subscriptions moved to their next charge dates.`,
      });
    } catch (error) {
      setItems(before);
      showSnackbar({
        variant: "error",
        title: "Could not renew them",
        message: subscriptionErrorMessage(error, "Could not renew your subscriptions."),
      });
    } finally {
      setRenewingAll(false);
    }
  };

  const openCreate = () => {
    setDetail(null);
    setDrawerMode("create");
    setEditing(null);
    setSubmitError("");
    setDrawerOpen(true);
  };

  const openEdit = (item: Subscription) => {
    setDetail(null);
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
      if (detail?.id === deleteTarget.id) setDetail(null);
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
  const monthlyLabel = formatMoneyList(totals?.monthly) || "—";

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
              What you pay, and the day it charges next.
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
          <SummaryLine label="Monthly" value={monthlyLabel} />
          <SummaryLine label="Yearly" value={yearlyLabel} />
          <SummaryLine label="Due in 30 days" value={dueLabel} />
          <SummaryLine label="Active" value={String(totals?.activeCount ?? 0)} />
        </View>

        {overdueCount > 0 ? (
          <View className="gap-3 rounded-nova-xl border border-danger/40 bg-danger/10 p-4 dark:border-dark-danger/40 dark:bg-dark-danger/10">
            <View className="flex-row items-start gap-3">
              <Ionicons name="alert-circle-outline" size={22} color={palette.danger} />
              <View className="flex-1">
                <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
                  {overdueCount === 1
                    ? "1 charge date has passed"
                    : `${overdueCount} charge dates have passed`}
                </Text>
                <Text className="mt-1 text-xs leading-[17px] text-muted dark:text-dark-muted">
                  Nova never moves a date on its own. If they already charged, renew them and the
                  dates roll to the next cycle.
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <RowAction
                label={filter === "overdue" ? "Show all" : "Review"}
                icon="eye-outline"
                onPress={() => setFilter(filter === "overdue" ? "all" : "overdue")}
              />
              <RowAction
                label={renewingAll ? "Renewing..." : "Renew all"}
                icon="refresh-outline"
                primary
                onPress={() => {
                  void renewAll();
                }}
              />
            </View>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {(
            [
              { id: "all", label: "All" },
              { id: "renewing", label: "Active" },
              { id: "trials", label: "Trials" },
              ...(overdueCount > 0 || filter === "overdue"
                ? [{ id: "overdue", label: `Overdue ${overdueCount}` } as const]
                : []),
              { id: "stopped", label: "Stopped" },
            ] as const
          ).map((chip) => (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              onPress={() => setFilter(chip.id)}
              className={`rounded-full border px-3 py-1.5 ${
                filter === chip.id
                  ? "border-accent/50 bg-accent/15 dark:border-dark-accent/50 dark:bg-dark-accent/15"
                  : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
              }`}
            >
              <Text
                className={`text-xs font-black ${
                  filter === chip.id
                    ? "text-accent dark:text-dark-accent"
                    : "text-primary dark:text-dark-primary"
                }`}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
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
            {current.length === 0 && ended.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                Nothing in this view.
              </Text>
            ) : null}

            {current.length > 0 ? (
              <View className="gap-4">
                {current.map((item) => (
                  <SubscriptionRow
                    key={item.id}
                    item={item}
                    onOpen={setDetail}
                    onAction={(row, action) => {
                      void runAction(row, action);
                    }}
                  />
                ))}
              </View>
            ) : null}

            {ended.length > 0 ? (
              <View className="gap-3">
                {filter === "all" && current.length > 0 ? (
                  <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
                    Stopped
                  </Text>
                ) : null}
                <View className="gap-4">
                  {ended.map((item) => (
                    <SubscriptionRow
                      key={item.id}
                      item={item}
                      quiet
                      onOpen={setDetail}
                      onAction={(row, action) => {
                        void runAction(row, action);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <BottomDrawer
        visible={Boolean(detail)}
        title={detail?.service ?? "Subscription"}
        subtitle={
          detail
            ? [detail.plan, intervalLabel(detail.intervalUnit, detail.intervalCount)]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
        onClose={() => setDetail(null)}
        footer={
          <View className="gap-3">
            {detail ? (
              <View className="flex-row gap-2">
                {canMarkRenewed(detail) ? (
                  <RowAction
                    label="Mark renewed"
                    icon="refresh-outline"
                    primary={isOverdueSubscription(detail)}
                    onPress={() => {
                      void runAction(detail, "renew");
                    }}
                  />
                ) : null}
                {isLiveSubscription(detail) ? (
                  <RowAction
                    label="Pause"
                    icon="pause-outline"
                    onPress={() => {
                      void runAction(detail, "pause");
                    }}
                  />
                ) : null}
                {detail.status === "PAUSED" ? (
                  <RowAction
                    label="Resume"
                    icon="play-outline"
                    primary
                    onPress={() => {
                      void runAction(detail, "resume");
                    }}
                  />
                ) : null}
                {detail.status === "CANCELED" ? (
                  <RowAction
                    label="Reactivate"
                    icon="arrow-undo-outline"
                    primary
                    onPress={() => {
                      void runAction(detail, "reactivate");
                    }}
                  />
                ) : null}
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (detail) setDeleteTarget(detail);
                }}
                className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-nova border border-danger/40 px-4 active:opacity-75 dark:border-dark-danger/40"
              >
                <Ionicons name="trash-outline" size={18} color={palette.danger} />
                <Text className="text-sm font-extrabold text-danger dark:text-dark-danger">
                  Delete
                </Text>
              </Pressable>
              <PrimaryButton
                label="Edit"
                onPress={() => {
                  if (detail) openEdit(detail);
                }}
                className="flex-1"
              />
            </View>
          </View>
        }
      >
        {detail ? (
          <View>
            <View className="flex-row items-start justify-between gap-3">
              <Text className="text-[34px] font-black text-accent dark:text-dark-accent">
                {formatMoney(detail.amount, detail.currency)}
              </Text>
              <StatusPill status={detail.status} />
            </View>
            <Text
              className={`mt-1 text-sm font-extrabold ${
                isOverdueSubscription(detail)
                  ? "text-danger dark:text-dark-danger"
                  : "text-muted dark:text-dark-muted"
              }`}
            >
              {subscriptionTimingLabel(detail)}
            </Text>
            {isOverdueSubscription(detail) ? (
              <Text className="mt-2 text-xs leading-[17px] text-muted dark:text-dark-muted">
                The saved date was {formatSubscriptionDate(detail.nextChargeAt)}. If it already
                charged, mark it renewed and Nova moves to the next date.
              </Text>
            ) : null}
            <View className="mt-4">
              <DetailLine
                label="Next charge"
                value={formatSubscriptionDate(detail.nextChargeAt)}
              />
              <DetailLine
                label="Repeats"
                value={intervalLabel(detail.intervalUnit, detail.intervalCount)}
              />
              <DetailLine
                label="Cancel by"
                value={
                  isLiveSubscription(detail) ? formatSubscriptionDate(detail.lastCancelBy) : ""
                }
              />
              <DetailLine
                label="Trial ends"
                value={formatSubscriptionDate(detail.trialEndsAt)}
              />
              <DetailLine
                label="Per month"
                value={formatMoney(detail.monthlyEquivalent, detail.currency)}
              />
              <DetailLine
                label="Per year"
                value={formatMoney(detail.yearlyCost, detail.currency)}
              />
              <DetailLine
                label="Reminder"
                value={
                  detail.reminderDays === 0
                    ? "Off"
                    : `${detail.reminderDays} day${detail.reminderDays === 1 ? "" : "s"} before`
                }
              />
              <DetailLine label="Paid with" value={detail.paymentLabel} />
              <DetailLine label="Why you keep it" value={detail.reason} />
              <DetailLine
                label="Previous price"
                value={
                  detail.previousPrice
                    ? `${formatMoney(detail.previousPrice.amount, detail.previousPrice.currency)} · until ${formatSubscriptionDate(detail.previousPrice.changedAt)}`
                    : ""
                }
              />
            </View>
            {isHttpUrl(detail.cancelUrl) ? (
              <View className="mt-4">
                <TextLink
                  label="Open cancel page"
                  onPress={() => {
                    const url = detail.cancelUrl?.trim();
                    if (url) void Linking.openURL(url);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </BottomDrawer>

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
