"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUser } from "@/components/providers/UserProvider";
import { useNotifications } from "@/components/providers/notification-context";
import { AdminShellSkeleton } from "@/components/skeletons/AdminSkeleton";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import Image from "next/image";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/demo", label: "Demo", icon: Activity },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/notifications", label: "Broadcasts", icon: Megaphone },
  { href: "/admin/ai", label: "AI", icon: Bot },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, initials, loading } = useUser();
  const { unreadCount, refreshNotifications } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  if (loading) {
    return <AdminShellSkeleton />;
  }

  if (profile?.accountRole !== "SUPER_ADMIN") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-main px-6 text-center">
        <Shield className="size-8 text-accent" />
        <h1 className="text-xl font-semibold text-primary">403 — Super Admin only</h1>
        <p className="text-sm text-primary/55">You don’t have access to this console.</p>
        <Link href="/dashboard" className="text-sm font-medium text-accent hover:underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-main text-primary">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-glass bg-sidebar px-4 py-6 md:flex md:flex-col">
        <div className="mb-8 flex items-center gap-2 px-2">
          {/* <Shield className="size-5 text-accent" /> */}
          <Image src="/logo.png" alt="Nova" width={40} height={40} />
          <div>
            <p className="text-sm font-semibold">Nova Admin</p>
            <p className="text-[11px] text-primary/45">Super Admin</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  active
                    ? "border border-glass-border bg-glass-button text-accent"
                    : "text-primary/70 hover:bg-glass-button hover:text-accent",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link href="/dashboard" className="px-3 text-xs text-primary/45 hover:text-accent">
          Back to workspace
        </Link>
      </aside>
      <div className="md:pl-60">
        <div className="flex items-center justify-between gap-3 border-b border-glass px-4 py-3 md:px-8">
          <div className="flex gap-2 overflow-x-auto md:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="shrink-0 text-xs text-accent">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNotificationsOpen(true);
                void refreshNotifications();
              }}
              className="relative flex size-10 items-center justify-center rounded-xl border border-glass bg-glass-card text-primary/65 transition hover:border-accent/35 hover:text-accent"
            >
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border border-sidebar bg-accent px-1 text-[10px] font-bold leading-5 text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            <ThemeToggle />

            <Link
              href="/admin/profile"
              className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-glass-button"
              aria-label="View your profile"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-primary">
                  {profile.name ?? "Guest"}
                </p>
                <p className="text-xs text-primary/50">
                  {profile.role ?? "—"}
                </p>
              </div>
              <div
                className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-glass bg-linear-135 from-accent to-accent/60 text-sm font-bold text-white shadow-sm shadow-accent/20"
                aria-hidden
              >
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
            </Link>
          </div>
        </div>
        <main className="p-6 md:p-8">{children}</main>
      </div>
      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
