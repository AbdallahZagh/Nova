"use client";

import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUser } from "@/components/providers/UserProvider";

type HeaderProps = {
  onMenuClick?: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, initials, loading } = useUser();

  return (
    <header className="bg-sidebar absolute top-0 right-0 left-0 z-30 flex h-16 items-center gap-4 px-4 md:px-8">
      <button
        type="button"
        aria-label="Open navigation"
        className="rounded-xl border border-glass bg-glass-card p-2 text-primary/70 backdrop-blur-xl hover:text-primary md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="size-5" />
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="size-4 z-10 absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
        <Input
          type="search"
          variant="soft"
          placeholder="Search tasks, projects..."
          className="pl-10"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />

        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-glass-button"
          aria-label="View your profile"
        >
          <div className="hidden text-right sm:block">
            {loading ? (
              <>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1 h-3 w-16" />
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-primary">
                  {profile?.name ?? "Guest"}
                </p>
                <p className="text-xs text-primary/50">
                  {profile?.role ?? "—"}
                </p>
              </>
            )}
          </div>
          <div
            className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-glass bg-linear-135 from-accent to-accent/60 text-sm font-bold text-white shadow-sm shadow-accent/20"
            aria-hidden
          >
            {loading ? (
              <Skeleton className="size-full rounded-full" />
            ) : profile?.avatarUrl ? (
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
    </header>
  );
}
