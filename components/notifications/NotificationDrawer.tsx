"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useNotifications } from "@/components/providers/notification-context";
import { cn } from "@/lib/cn";
import type { AppNotification } from "@/lib/api/notifications";
import {
  formatNotificationType,
  hrefFromNotification,
} from "@/lib/notifications/links";

type NotificationDrawerProps = {
  open: boolean;
  onClose: () => void;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeClass(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("error") || normalized.includes("failed")) {
    return "border-danger/25 bg-danger/10 text-danger";
  }
  if (normalized.includes("warning")) {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  if (normalized.includes("success") || normalized.includes("completed")) {
    return "border-success/30 bg-success/10 text-success";
  }
  return "border-accent/25 bg-accent/10 text-accent";
}

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-glass bg-main/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary/45">
        Metadata
      </p>
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-primary/60">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
}

function NotificationListItem({
  item,
  active,
  onSelect,
}: {
  item: AppNotification;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition hover:border-accent/25 hover:bg-glass-button/60",
        active
          ? "border-accent/40 bg-accent/10"
          : item.isRead
            ? "border-glass bg-glass-card/50"
            : "border-accent/25 bg-accent/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-glass bg-glass-button text-accent">
          <Bell className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-primary">
              {item.title}
            </h3>
            {!item.isRead ? (
              <span className="mt-1 size-2 shrink-0 rounded-full bg-accent" />
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-primary/60">
            {item.message}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                typeClass(item.type),
              )}
            >
              {formatNotificationType(item.type)}
            </span>
            <span className="text-xs text-primary/40">
              {formatNotificationTime(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function NotificationDetail({ item }: { item: AppNotification }) {
  return (
    <section className="h-full rounded-2xl border border-glass bg-glass-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-glass bg-glass-button text-accent">
          <Bell className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                typeClass(item.type),
              )}
            >
              {formatNotificationType(item.type)}
            </span>
            <span className="text-xs text-primary/40">
              {formatNotificationTime(item.createdAt)}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-tight text-primary">
            {item.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-primary/65">
            {item.message}
          </p>
        </div>
      </div>
      <MetadataBlock metadata={item.metadata} />
    </section>
  );
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    total,
    refreshNotifications,
    loadMoreNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotifications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => notifications.find((item) => item.id === selectedId) ?? null,
    [notifications, selectedId],
  );

  useEffect(() => {
    if (!open || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void loadMoreNotifications();
      }
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMoreNotifications, open]);

  const handleSelect = (item: AppNotification) => {
    void markNotificationRead(item.id);
    const href = hrefFromNotification(item);
    if (href) {
      setSelectedId(null);
      onClose();
      router.push(href);
      return;
    }
    setSelectedId(item.id);
  };

  const handleMarkAll = () => {
    void markAllNotificationsRead();
  };

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <SideDrawer
      isOpen={open}
      onClose={handleClose}
      title="Notifications"
      panelClassName={selected ? "overflow-hidden lg:max-w-[50vw] lg:min-w-[50vw]" : undefined}
      bodyClassName="overflow-hidden p-0"
    >
      <div
        className={cn(
          "grid h-full min-h-0 min-w-0 overflow-hidden",
          selected ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-primary/55">
              {total || notifications.length
                ? `${notifications.length}${total ? ` of ${total}` : ""} notification${(total || notifications.length) === 1 ? "" : "s"}`
                : "Workspace updates will appear here."}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={unreadCount === 0}
                className="flex items-center gap-2 rounded-xl border border-glass bg-glass-button px-3 py-2 text-xs font-semibold text-primary/70 transition hover:border-accent/35 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CheckCheck className="size-3.5" />
                Read all
              </button>
              <button
                type="button"
                onClick={() => void refreshNotifications()}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-glass bg-glass-button px-3 py-2 text-xs font-semibold text-primary/70 transition hover:border-accent/35 hover:text-accent disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh
              </button>
            </div>
          </div>

          {loading && notifications.length === 0 ? (
            <div className="rounded-2xl border border-glass bg-glass-card px-4 py-10 text-center text-sm text-primary/45">
              <Loader2 className="mx-auto mb-3 size-5 animate-spin text-accent" />
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-glass bg-glass-card px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl border border-glass bg-glass-button text-accent">
                <Bell className="size-5" />
              </div>
              <p className="text-sm font-semibold text-primary">
                No notifications yet
              </p>
              <p className="mt-1 text-xs text-primary/45">
                New project, task, and whiteboard updates will show here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <NotificationListItem
                  key={item.id}
                  item={item}
                  active={selectedId === item.id}
                  onSelect={() => handleSelect(item)}
                />
              ))}
              <div ref={sentinelRef} className="h-3" />
              {loadingMore ? (
                <div className="py-3 text-center text-xs text-primary/45">
                  <Loader2 className="mx-auto mb-2 size-4 animate-spin text-accent" />
                  Loading more...
                </div>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMoreNotifications()}
                  className="w-full rounded-xl border border-glass bg-glass-button px-3 py-2 text-xs font-semibold text-primary/60 transition hover:border-accent/35 hover:text-accent"
                >
                  Load more
                </button>
              ) : null}
            </div>
          )}
        </div>

        {selected ? (
          <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-t border-glass p-5 lg:border-l lg:border-t-0">
            <NotificationDetail item={selected} />
          </div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
