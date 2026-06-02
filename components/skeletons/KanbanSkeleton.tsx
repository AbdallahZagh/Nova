import { Skeleton } from "@/components/ui/Skeleton";

export function KanbanSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full max-w-lg" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div
            key={col}
            className="rounded-2xl border border-glass bg-glass-card/50 p-4"
          >
            <Skeleton className="mb-4 h-5 w-24" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, card) => (
                <div
                  key={card}
                  className="rounded-xl border border-glass bg-glass-button/40 p-4"
                >
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                  <Skeleton className="mt-3 h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
