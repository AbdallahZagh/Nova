import React from "react";
import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
};

/** Glass-themed shimmer placeholder — use inside page layouts while GET data loads. */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-glass-button",
        className,
      )}
      style={style}
      aria-hidden
    />
  );
}
