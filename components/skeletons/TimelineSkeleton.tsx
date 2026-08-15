import { Skeleton } from "@/components/ui/Skeleton";

export function TimelineSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-glass bg-sidebar">
        <div className="flex gap-2 border-b border-glass p-3">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-48 rounded-xl" />
        </div>
        <div className="grid grid-cols-7 gap-px p-3">
          {Array.from({ length: 21 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
