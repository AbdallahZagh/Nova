import { Skeleton } from "@/components/ui/Skeleton";

export function TimelineBoardSkeleton() {
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 gap-px p-3"
      aria-busy="true"
      aria-label="Loading timeline"
    >
      {Array.from({ length: 35 }).map((_, index) => (
        <Skeleton key={index} className="h-full min-h-16 rounded-md" />
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 p-6 md:-m-8 md:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-glass bg-sidebar">
        <div className="flex gap-2 border-b border-glass p-3">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-48 rounded-xl" />
        </div>
        <div className="border-b border-glass p-3">
          <Skeleton className="h-8 w-72 rounded-xl" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px p-3">
          {Array.from({ length: 42 }).map((_, i) => (
            <Skeleton key={i} className="h-full min-h-0 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
