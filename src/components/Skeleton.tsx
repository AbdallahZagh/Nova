import { View, type ViewProps } from "react-native";

type SkeletonProps = ViewProps & {
  className?: string;
};

export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <View
      {...props}
      className={`overflow-hidden rounded-nova bg-glass-button dark:bg-dark-glass-button ${className}`}
    />
  );
}

export function SkeletonLine({ className = "", ...props }: SkeletonProps) {
  return <Skeleton {...props} className={`h-3 ${className}`} />;
}

export function SkeletonCircle({ className = "", ...props }: SkeletonProps) {
  return <Skeleton {...props} className={`rounded-full ${className}`} />;
}

export function WhiteboardEditorSkeleton() {
  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <View className="flex-row items-center gap-2 px-2 pt-2">
        <Skeleton className="size-8 rounded-nova" />
        <SkeletonLine className="h-4 flex-1" />
        <View className="flex-row items-center">
          <SkeletonCircle className="size-7" />
          <SkeletonCircle className="-ml-1.5 size-7" />
          <SkeletonCircle className="-ml-1.5 size-7" />
        </View>
        <SkeletonLine className="h-3 w-10" />
      </View>
      <View className="min-h-0 flex-1 px-2 pb-2 pt-2">
        <Skeleton className="h-full w-full rounded-nova-lg" />
      </View>
      {/* <SkeletonCircle className="absolute bottom-5 left-5 size-12" /> */}
    </View>
  );
}

export function NoteDetailSkeleton() {
  return (
    <View className="flex-1 gap-5 bg-main p-5 dark:bg-dark-main">
      <View className="flex-row items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-nova" />
        <SkeletonLine className="h-3 flex-1" />
        <Skeleton className="h-10 w-10 rounded-nova" />
        <Skeleton className="h-10 w-10 rounded-nova" />
      </View>
      <SkeletonLine className="h-8 w-2/3" />
      <View className="gap-3 pt-1">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-11/12" />
        <SkeletonLine className="w-4/5" />
        <SkeletonLine className="w-3/5" />
      </View>
      <Skeleton className="mt-2 h-9 w-40 rounded-full" />
      <View className="gap-3 pt-2">
        <SkeletonLine className="h-3 w-16" />
        <View className="flex-row gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCircle key={index} className="size-[30px]" />
          ))}
        </View>
      </View>
      <View className="gap-2 pt-1">
        <SkeletonLine className="h-3 w-16" />
        <Skeleton className="h-12 w-full rounded-nova" />
      </View>
    </View>
  );
}

export function PageSkeleton() {
  return (
    <View className="flex-1 gap-5 bg-main p-5 dark:bg-dark-main">
      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <View className="flex-row items-center gap-4">
          <SkeletonCircle className="h-[68px] w-[68px]" />
          <View className="flex-1 gap-3">
            <SkeletonLine className="h-5 w-3/4" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-2/3" />
          </View>
        </View>
      </View>

      {Array.from({ length: 3 }).map((_, index) => (
        <View
          key={index}
          className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar"
        >
          <View className="gap-3">
            <SkeletonLine className="h-5 w-1/2" />
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-5/6" />
            <SkeletonLine className="w-2/3" />
          </View>
        </View>
      ))}
    </View>
  );
}
