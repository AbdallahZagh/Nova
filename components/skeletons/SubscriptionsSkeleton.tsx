import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";

export function SubscriptionsSkeleton() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 overflow-hidden p-6 md:-m-8 md:p-8">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-hidden">
        <GlassCard className="grid gap-6 lg:grid-cols-[1.2fr_1.3fr_1fr]">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-6 h-10 w-36" />
            <Skeleton className="mt-3 h-4 w-28" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </GlassCard>
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-80 rounded-xl" />
          <Skeleton className="ml-auto h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <GlassCard key={index} className="h-52">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-6 h-8 w-32" />
              <Skeleton className="mt-8 h-3 w-40" />
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
