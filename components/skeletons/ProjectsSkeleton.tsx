import { Skeleton } from "@/components/ui/Skeleton";

export function ProjectsSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-36" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <Skeleton className="h-14 w-full rounded-2xl" />

      <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-glass bg-glass-card p-6"
          >
            <div className="flex justify-between gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-5 h-2 w-full rounded-full" />
            <div className="mt-3 flex justify-between">
              <Skeleton className="h-3 w-20" />
              <div className="flex -space-x-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="size-7 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
