import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";

export function MetricsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <GlassCard key={i}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-9 w-16" />
        </GlassCard>
      ))}
    </div>
  );
}

export function ActivityHeatmapSkeleton() {
  return (
    <>
      <div className="mb-3 flex justify-between">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="relative mb-1 ml-7 h-[14px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="absolute h-3 w-6"
            style={{ left: `${(i / 5) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        <div className="flex w-6 shrink-0 flex-col gap-[3px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1 rounded-sm" />
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-12 gap-[3px]">
          {Array.from({ length: 12 * 7 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-[2px]" />
          ))}
        </div>
      </div>
    </>
  );
}

export function UrgentTasksTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-glass/40 pb-3 last:border-0"
        >
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-xs" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Full-page fallback (e.g. initial paint) */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <MetricsCardsSkeleton />
      <GlassCard title="Recent Activity">
        <ActivityHeatmapSkeleton />
      </GlassCard>
      <GlassCard title="Urgent Tasks">
        <UrgentTasksTableSkeleton />
      </GlassCard>
    </div>
  );
}
