import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>

      <GlassCard className="p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Skeleton className="size-24 rounded-2xl" />
          <div className="flex-1 space-y-2 sm:text-left">
            <Skeleton className="mx-auto h-6 w-40 sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-32 sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-48 sm:mx-0" />
            <Skeleton className="mx-auto mt-2 h-12 w-full max-w-sm sm:mx-0" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-16 w-20 rounded-xl" />
            <Skeleton className="h-16 w-20 rounded-xl" />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <Skeleton className="mb-5 h-5 w-32" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-4 h-24 w-full" />
        <div className="mt-4 flex justify-end">
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <Skeleton className="mb-5 h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
      </GlassCard>
    </div>
  );
}
