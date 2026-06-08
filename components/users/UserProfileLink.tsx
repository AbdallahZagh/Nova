"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type UserProfileLinkProps = {
  userId?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
};

export function UserProfileLink({
  userId,
  children,
  className,
  title,
}: UserProfileLinkProps) {
  if (!userId) return <>{children}</>;

  return (
    <Link
      href={`/users/${userId}`}
      title={title}
      onClick={(event) => event.stopPropagation()}
      className={cn("transition hover:text-accent", className)}
    >
      {children}
    </Link>
  );
}
