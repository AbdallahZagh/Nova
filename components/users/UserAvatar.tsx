"use client";

import { cn } from "@/lib/cn";
import { getInitials } from "@/components/providers/UserProvider";

const sizeClasses = {
  xs: "size-6 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-xs",
  xl: "size-20 text-2xl sm:size-24 sm:text-3xl",
} as const;

type UserAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  initials?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
};

export function UserAvatar({
  name,
  avatarUrl,
  initials,
  size = "md",
  className,
}: UserAvatarProps) {
  const label = (initials || (name ? getInitials(name) : "?")).slice(0, 2);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass bg-linear-135 from-accent to-accent/60 font-semibold text-white",
        sizeClasses[size],
        className,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        label
      )}
    </span>
  );
}
