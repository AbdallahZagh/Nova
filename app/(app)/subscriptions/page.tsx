"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard";
import { SubscriptionDetails } from "@/components/subscriptions/SubscriptionDetails";
import { SubscriptionForm } from "@/components/subscriptions/SubscriptionForm";
import {
  OverdueBanner,
  SubscriptionsSummary,
} from "@/components/subscriptions/SubscriptionsSummary";
import { SubscriptionsSkeleton } from "@/components/skeletons/SubscriptionsSkeleton";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  getSubscriptionApi,
  listSubscriptionsApi,
  renewAllSubscriptionsApi,
  renewSubscriptionApi,
  updateSubscriptionApi,
} from "@/lib/api/subscriptions";
import { cn } from "@/lib/cn";
import {
  applyQuickAction,
  EMPTY_SUBSCRIPTION_TOTALS,
  formatChargeDate,
  isLiveSubscription,
  isStoppedSubscription,
  normalizeSubscriptionList,
  subscriptionHref,
  type Subscription,
  type SubscriptionQuickAction,
  type SubscriptionTotals,
} from "@/lib/subscriptions";

type ListFilter = "all" | "renewing" | "trials" | "overdue" | "stopped";
type SortKey = "soonest" | "price" | "name";

const FILTERS: ListFilter[] = ["all", "renewing", "trials", "overdue", "stopped"];

const SORT_OPTIONS = [
  { value: "soonest", label: "Soonest charge" },
  { value: "price", label: "Highest price" },
  { value: "name", label: "Name A to Z" },
];

function parseFilter(value: string | null): ListFilter {
  return FILTERS.includes(value as ListFilter) ? (value as ListFilter) : "all";
}

function bySoonest(a: Subscription, b: Subscription) {
  return a.daysUntilCharge - b.daysUntilCharge || a.service.localeCompare(b.service);
}

function sortList(list: Subscription[], sort: SortKey) {
  const copy = list.slice();
  if (sort === "price") {
    return copy.sort(
      (a, b) => Number(b.monthlyEquivalent) - Number(a.monthlyEquivalent) || bySoonest(a, b),
    );
  }
  if (sort === "name") return copy.sort((a, b) => a.service.localeCompare(b.service));
  return copy.sort(bySoonest);
}

function matchesFilter(item: Subscription, filter: ListFilter) {
  switch (filter) {
    case "renewing":
      return item.status === "ACTIVE";
    case "trials":
      return item.status === "TRIAL";
    case "overdue":
      return item.overdue && isLiveSubscription(item);
    case "stopped":
      return isStoppedSubscription(item);
    default:
      return true;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function SubscriptionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const filterParam = searchParams.get("filter");
  const wantsNew = searchParams.get("new") === "1";

  const [items, setItems] = useState<Subscription[]>([]);
  const [totals, setTotals] = useState<SubscriptionTotals>(EMPTY_SUBSCRIPTION_TOTALS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<ListFilter>(() => parseFilter(filterParam));
  const [seenFilterParam, setSeenFilterParam] = useState(filterParam);
  const [sort, setSort] = useState<SortKey>("soonest");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingForm, setEditingForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [linkedItem, setLinkedItem] = useState<Subscription | null>(null);
  const [missingId, setMissingId] = useState<string | null>(null);
  const [renewingAll, setRenewingAll] = useState(false);
  const pending = useRef(0);
  const askedFor = useRef<string | null>(null);
  const handledNew = useRef(false);

  if (hiddenId && hiddenId !== requestedId) {
    setHiddenId(null);
  }
  if (filterParam !== seenFilterParam) {
    setSeenFilterParam(filterParam);
    if (filterParam) setFilter(parseFilter(filterParam));
  }

  const load = useCallback(
    async (quiet = false) => {
      try {
        const data = normalizeSubscriptionList(await listSubscriptionsApi());
        setItems(data.items);
        setTotals(data.totals);
        setLoadError("");
      } catch (err) {
        const message = errorMessage(err, "Could not load subscriptions.");
        if (!quiet) {
          setLoadError(message);
          toast({ variant: "error", title: "Could not load subscriptions", message });
        }
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

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

  const linkedId = requestedId && hiddenId !== requestedId ? requestedId : null;
  const inList = linkedId ? items.some((item) => item.id === linkedId) : true;

  // A link can point at a subscription that is not in the list (for example a reminder
  // for one that was filtered out). Fetch it by id, and say so if it is gone.
  useEffect(() => {
    if (loading || !linkedId || inList || askedFor.current === linkedId) return;
    askedFor.current = linkedId;
    let cancelled = false;
    void (async () => {
      try {
        const found = await getSubscriptionApi(linkedId);
        if (!cancelled) setLinkedItem(found);
      } catch {
        if (cancelled) return;
        setMissingId(linkedId);
        setHiddenId(linkedId);
        toast({
          variant: "error",
          title: "Subscription not found",
          message: "It may have been deleted.",
        });
        router.replace("/subscriptions", { scroll: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, linkedId, inList, router, toast]);

  // ?new=1 opens the add drawer, then clears itself from the address.
  useEffect(() => {
    if (loading || !wantsNew || handledNew.current) return;
    handledNew.current = true;
    void (async () => {
      await Promise.resolve();
      setCreating(true);
      setEditingForm(true);
      router.replace("/subscriptions", { scroll: false });
    })();
  }, [loading, wantsNew, router]);

  const selectedKey = selectedId ?? linkedId;
  const viewing = creating
    ? null
    : (items.find((item) => item.id === selectedKey) ??
      (linkedItem && linkedItem.id === selectedKey ? linkedItem : null));
  const drawerOpen = creating || Boolean(viewing);
  const showForm = creating || editingForm;

  const counts = useMemo(
    () => ({
      all: items.length,
      renewing: items.filter((item) => item.status === "ACTIVE").length,
      trials: items.filter((item) => item.status === "TRIAL").length,
      overdue: items.filter((item) => item.overdue && isLiveSubscription(item)).length,
      stopped: items.filter(isStoppedSubscription).length,
    }),
    [items],
  );

  const { sections, shown } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = items.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (!needle) return true;
      return [item.service, item.plan, item.paymentLabel]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(needle));
    });
    const live = sortList(matching.filter(isLiveSubscription), sort);
    const stopped = sortList(matching.filter(isStoppedSubscription), sort);
    const grouped = sort === "soonest";
    const soon = grouped ? live.filter((item) => item.overdue || item.daysUntilCharge <= 7) : [];
    const later = grouped ? live.filter((item) => !item.overdue && item.daysUntilCharge > 7) : live;
    const all = [
      { key: "soon", title: "Due soon", items: soon },
      { key: "later", title: grouped ? "Later" : "Subscriptions", items: later },
      { key: "stopped", title: "Paused and canceled", items: stopped },
    ].filter((section) => section.items.length > 0);
    return { sections: all, shown: matching.length };
  }, [filter, items, query, sort]);

  function clearLinkParams() {
    if (requestedId) {
      setHiddenId(requestedId);
      router.replace("/subscriptions", { scroll: false });
    }
  }

  function closeDrawer() {
    clearLinkParams();
    setCreating(false);
    setEditingForm(false);
    setSelectedId(null);
    setLinkedItem(null);
  }

  function openCreate() {
    setCreating(true);
    setEditingForm(true);
    setSelectedId(null);
    clearLinkParams();
  }

  function openView(item: Subscription) {
    setCreating(false);
    setEditingForm(false);
    setSelectedId(item.id);
    setHiddenId(null);
    router.replace(subscriptionHref(item.id), { scroll: false });
  }

  function replaceItem(next: Subscription) {
    setItems((current) => current.map((row) => (row.id === next.id ? next : row)));
    setLinkedItem((current) => (current && current.id === next.id ? next : current));
  }

  function settle() {
    pending.current -= 1;
    if (pending.current <= 0) {
      pending.current = 0;
      void load(true);
    }
  }

  // The row changes right away; the server answer replaces it, and a failure puts it back.
  async function runAction(item: Subscription, action: SubscriptionQuickAction) {
    replaceItem(applyQuickAction(item, action));
    pending.current += 1;
    try {
      let saved: Subscription;
      if (action === "renew") saved = await renewSubscriptionApi(item.id);
      else {
        saved = await updateSubscriptionApi(item.id, {
          status: action === "pause" ? "PAUSED" : "ACTIVE",
        });
      }
      if (saved && typeof saved.id === "string") replaceItem(saved);
      const stillOverdue = action === "reactivate" && saved?.overdue;
      toast({
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
            ? `${item.service} charges next on ${formatChargeDate(saved?.nextChargeAt)}.`
            : action === "pause"
              ? `${item.service} will not remind you until you resume it.`
              : stillOverdue
                ? `${item.service} is active, but its saved date passed. Mark it renewed if it already charged.`
                : `${item.service} is active again.`,
      });
    } catch (err) {
      replaceItem(item);
      toast({
        variant: "error",
        title: "That did not work",
        message: errorMessage(err, "Could not update this subscription."),
      });
    } finally {
      settle();
    }
  }

  async function renewAll() {
    const overdue = items.filter((item) => item.overdue && isLiveSubscription(item));
    if (overdue.length === 0 || renewingAll) return;
    const before = items;
    setRenewingAll(true);
    setItems((current) =>
      current.map((row) =>
        row.overdue && isLiveSubscription(row) ? applyQuickAction(row, "renew") : row,
      ),
    );
    try {
      const result = await renewAllSubscriptionsApi();
      const data = normalizeSubscriptionList(result);
      setItems(data.items);
      setTotals(data.totals);
      setFilter((current) => (current === "overdue" ? "all" : current));
      toast({
        variant: "success",
        title: "Renewed",
        message:
          result.renewed === 1
            ? "1 subscription moved to its next charge date."
            : `${result.renewed} subscriptions moved to their next charge dates.`,
      });
    } catch (err) {
      setItems(before);
      toast({
        variant: "error",
        title: "Could not renew them",
        message: errorMessage(err, "Could not renew your subscriptions."),
      });
    } finally {
      setRenewingAll(false);
    }
  }

  const filterTabs: { value: ListFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "renewing", label: "Active", count: counts.renewing },
    { value: "trials", label: "Trials", count: counts.trials },
    ...(counts.overdue > 0 || filter === "overdue"
      ? [{ value: "overdue" as const, label: "Overdue", count: counts.overdue }]
      : []),
    { value: "stopped", label: "Stopped", count: counts.stopped },
  ];

  if (loading) return <SubscriptionsSkeleton />;

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 p-6 md:-m-8 md:p-8">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Subscriptions</h1>
          <p className="mt-1 text-sm text-primary/60">
            What you pay, and the day it charges next.
          </p>
        </div>
        <Button variant="accent" className="inline-flex items-center" onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />
          Add subscription
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6 pr-1">
        {items.length > 0 ? (
          <SubscriptionsSummary
            items={items}
            totals={totals}
            onOpen={openView}
            onFilter={setFilter}
          />
        ) : null}

        <OverdueBanner
          count={counts.overdue}
          reviewing={filter === "overdue"}
          busy={renewingAll}
          onRenewAll={() => void renewAll()}
          onReview={() => setFilter(filter === "overdue" ? "all" : "overdue")}
        />

        {missingId ? (
          <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-warning/40 p-4">
            <p className="text-sm text-primary/70">
              That subscription was not found. It may have been deleted.
            </p>
            <Button variant="secondary" onClick={() => setMissingId(null)}>
              Dismiss
            </Button>
          </GlassCard>
        ) : null}

        {items.length > 0 ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-glass bg-sidebar/80 p-2 backdrop-blur-xl">
            <div
              role="tablist"
              aria-label="Filter subscriptions"
              className="flex flex-wrap gap-1"
            >
              {filterTabs.map((tab) => {
                const active = filter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50",
                      active
                        ? "bg-accent text-white shadow-sm"
                        : "text-primary/65 hover:bg-white/5 hover:text-primary",
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] tabular-nums",
                        active ? "bg-white/20" : "bg-white/5 text-primary/55",
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-primary/45" />
              <Input
                variant="soft"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search subscriptions"
                aria-label="Search subscriptions"
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={sort}
                onChange={(value) => setSort(value as SortKey)}
                options={SORT_OPTIONS}
                aria-label="Sort subscriptions"
              />
            </div>
          </div>
        ) : null}

        {loadError ? (
          <p className="text-sm text-danger" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loadError && items.length === 0 ? (
          <GlassCard className="flex flex-col items-start gap-3">
            <p className="text-base font-medium text-primary">Nothing tracked yet</p>
            <p className="max-w-md text-sm text-primary/55">
              Add the services you pay for. You only need the name, the price, and the next charge
              date.
            </p>
            <Button variant="accent" onClick={openCreate}>
              Add subscription
            </Button>
          </GlassCard>
        ) : null}

        {!loadError && items.length > 0 && shown === 0 ? (
          <GlassCard className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-primary/60">
              {query.trim() ? `Nothing matches "${query.trim()}".` : "Nothing in this view."}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          </GlassCard>
        ) : null}

        {sections.map((section) => (
          <section key={section.key} className="flex flex-col gap-3">
            {sections.length > 1 ? (
              <h2 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-primary/45">
                {section.title}
                <span className="font-normal normal-case tracking-normal text-primary/35">
                  {section.items.length}
                </span>
              </h2>
            ) : null}
            <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <SubscriptionCard
                  key={item.id}
                  item={item}
                  onOpen={openView}
                  onAction={(row, action) => void runAction(row, action)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <SideDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={
          creating
            ? "Add subscription"
            : showForm
              ? "Edit subscription"
              : (viewing?.service ?? "Subscription")
        }
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {drawerOpen && viewing && !showForm ? (
          <SubscriptionDetails
            item={viewing}
            onEdit={() => setEditingForm(true)}
            onAction={(row, action) => void runAction(row, action)}
            onDeleted={async () => {
              closeDrawer();
              await load(true);
            }}
          />
        ) : null}
        {drawerOpen && showForm ? (
          <SubscriptionForm
            key={viewing?.id ?? "new"}
            subscription={viewing}
            onCancel={() => {
              if (viewing) setEditingForm(false);
              else closeDrawer();
            }}
            onSaved={async () => {
              closeDrawer();
              await load(true);
            }}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

export default function SubscriptionsPageRoute() {
  return (
    <Suspense fallback={<SubscriptionsSkeleton />}>
      <SubscriptionsPage />
    </Suspense>
  );
}
