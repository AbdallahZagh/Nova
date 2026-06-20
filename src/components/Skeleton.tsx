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
