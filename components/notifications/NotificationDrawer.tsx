"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  MessageSquare,
  PenLine,
  RefreshCw,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useNotifications } from "@/components/providers/notification-context";
import { cn } from "@/lib/cn";
import type { AppNotification } from "@/lib/api/notifications";
import {
  formatNotificationTime,
  formatNotificationType,
  groupNotificationsByDay,
  hrefFromNotification,
  notificationKind,
  notificationTone,
  type NotificationKind,
  type NotificationTone,
} from "@/lib/notifications/links";

type NotificationDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type InboxFilter = "all" | "unread";

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  overdue: AlertTriangle,
  due: Clock,
  mention: AtSign,
  assigned: UserPlus,
  unassigned: UserMinus,
  done: Check,
  project: Users,
  whiteboard: PenLine,
  comment: MessageSquare,
  default: Bell,
};

const TONE_PILL: Record<NotificationTone, string> = {
  warning: "border-warning/40 bg-warning/10 text-warning",
  success: "border-success/40 bg-success/10 text-success",
  accent: "border-accent/40 bg-accent/10 text-accent",
  muted: "border-glass bg-glass-button text-primary/55",
  default: "border-accent/25 bg-accent/10 text-accent",
};

const TONE_ICON: Record<NotificationTone, string> = {
  warning: "border-warning/40 bg-warning/10 text-warning",
  success: "border-success/40 bg-success/10 text-success",
  accent: "border-accent/40 bg-accent/10 text-accent",
  muted: "border-glass bg-glass-button text-primary/50",
  default: "border-glass bg-glass-button text-accent",
};

function NotificationListItem({
  item,
  onSelect,
}: {
  item: AppNotification;
  onSelect: () => void;
}) {
  const kind = notificationKind(item.type);
  const tone = notificationTone(item.type);
  const Icon = KIND_ICON[kind];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition hover:border-accent/25 hover:bg-glass-button/60",
        item.isRead
          ? "border-glass bg-glass-card/50"
          : tone === "warning"
            ? "border-warning/40 bg-warning/5"
            : "border-accent/25 bg-accent/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border",
            TONE_ICON[tone],
          )}
        >
          <Icon className="size-4" />
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
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                TONE_PILL[tone],
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
  const [filter, setFilter] = useState<InboxFilter>("all");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((item) => !item.isRead)
        : notifications,
    [filter, notifications],
  );
  const groups = useMemo(() => groupNotificationsByDay(visible), [visible]);

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
      onClose();
      router.push(href);
    }
  };

  return (
    <SideDrawer isOpen={open} onClose={onClose} title="Notifications">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-primary/55">
          {total || notifications.length
            ? `${notifications.length}${total ? ` of ${total}` : ""} notification${(total || notifications.length) === 1 ? "" : "s"}`
            : "Workspace updates will appear here."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void markAllNotificationsRead()}
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

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All" },
            {
              id: "unread",
              label: unreadCount > 0 ? `Unread ${unreadCount}` : "Unread",
            },
          ] as const
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              filter === chip.id
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-glass bg-glass-button text-primary/65 hover:border-accent/35 hover:text-accent",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="rounded-2xl border border-glass bg-glass-card px-4 py-10 text-center text-sm text-primary/45">
          <Loader2 className="mx-auto mb-3 size-5 animate-spin text-accent" />
          Loading notifications...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-glass bg-glass-card px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl border border-glass bg-glass-button text-accent">
            <Bell className="size-5" />
          </div>
          <p className="text-sm font-semibold text-primary">
            {filter === "unread" ? "You're all caught up" : "No notifications yet"}
          </p>
          <p className="mt-1 text-xs text-primary/45">
            {filter === "unread"
              ? "New updates will show up here."
              : "New project, task, and whiteboard updates will show here."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label} className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/45">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NotificationListItem
                  key={item.id}
                  item={item}
                  onSelect={() => handleSelect(item)}
                />
              ))}
            </section>
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
    </SideDrawer>
  );
}
