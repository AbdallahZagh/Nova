import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
};

/** Glass-themed shimmer placeholder — use inside page layouts while GET data loads. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-glass-button",
        className,
      )}
      aria-hidden
    />
  );
}
