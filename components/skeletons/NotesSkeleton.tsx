import { Skeleton } from "@/components/ui/Skeleton";

const HEIGHTS = [176, 224, 144, 256, 160, 208, 192, 144];

export function NotesSkeleton() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 overflow-hidden p-6 md:-m-8 md:p-8">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-10 w-52 rounded-xl" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 columns-1 gap-4 overflow-hidden sm:columns-2 xl:columns-3 2xl:columns-4">
        {HEIGHTS.map((height, index) => (
          <Skeleton
            key={index}
            className="mb-4 w-full break-inside-avoid rounded-2xl"
            style={{ height }}
          />
        ))}
      </div>
    </div>
  );
}
