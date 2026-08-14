import { Skeleton } from "@/components/ui/Skeleton";

export function WhiteboardEditorSkeleton() {
  return (
    <div className="relative -m-6 flex h-[calc(100dvh-4rem)] flex-col md:-m-8">
      <div className="z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-glass bg-main px-4 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.18)] md:px-6">
        <Skeleton className="size-8 rounded-xl" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-6 w-14 rounded-full" />
        <div className="ml-auto flex items-center">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={index}
              className="size-7 rounded-full"
              style={index > 0 ? { marginLeft: -6 } : undefined}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-6 pt-2 md:px-6">
        <Skeleton className="h-full w-full rounded-2xl" />
      </div>

      {/* <Skeleton className="absolute bottom-4 left-4 z-30 size-12 rounded-full" /> */}
    </div>
  );
}
