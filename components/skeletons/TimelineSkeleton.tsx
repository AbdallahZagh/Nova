import { Skeleton } from "@/components/ui/Skeleton";

export function TimelineSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-glass bg-glass-card">
        <Skeleton className="h-12 w-full rounded-none" />
        <div className="flex">
          <div className="hidden w-40 shrink-0 border-r border-glass p-3 md:block">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="mb-4 h-8 w-full" />
            ))}
          </div>
          <div className="min-w-0 flex-1 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mb-6 flex items-center gap-3">
                <Skeleton className="h-8 w-full max-w-[200px] rounded-lg" />
                <Skeleton className="h-7 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
