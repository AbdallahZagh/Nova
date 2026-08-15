import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>

      <GlassCard>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 sm:gap-5">
            <Skeleton className="size-20 rounded-full sm:size-24" />
            <div className="space-y-2 pt-1">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-12 w-16" />
            <Skeleton className="h-12 w-16" />
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <Skeleton className="mb-5 h-5 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-4 h-24 w-full" />
        </GlassCard>
        <GlassCard>
          <Skeleton className="mb-5 h-5 w-40" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="mt-4 h-10 w-full" />
        </GlassCard>
      </div>
    </div>
  );
}
