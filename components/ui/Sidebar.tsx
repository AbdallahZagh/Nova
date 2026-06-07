"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  FolderKanban,
  GanttChart,
  LayoutDashboard,
  LogOut,
  X,
} from "lucide-react";
import { clearSession } from "@/app/actions/session";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import Image from "next/image";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/timeline", label: "Timeline", icon: GanttChart },
] as const;

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await clearSession();
    } catch {
      toast({ variant: "error", title: "Sign out failed", message: "Please try again." });
      setLoggingOut(false);
    }
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col bg-sidebar px-4 py-6 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex justify-center items-center gap-1">
            <Image src="/logo.png" alt="Taskflow" width={40} height={40} />
            <p className="text-xl font-semibold bg-linear-90 from-accent to-primary text-transparent bg-clip-text">Taskflow</p>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-primary/60 hover:bg-glass-card md:hidden"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-glass-button border border-glass-border text-accent"
                    : "text-primary/70 hover:bg-glass-button hover:text-accent",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="h-0.5 w-full bg-linear-90 from-transparent via-accent to-transparent" />
          <button
            type="button"
            disabled={loggingOut}
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:text-danger hover:bg-glass-button disabled:opacity-50"
          >
            <LogOut className="size-4 shrink-0" />
            {loggingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
        <div className="h-full w-0.5 absolute right-0 bg-linear-180 from-transparent from-15% via-accent to-85% to-transparent" />
      </aside>
    </>
  );
}
