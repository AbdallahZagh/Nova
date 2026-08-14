import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import { apiClient } from "@/api/apiClient";
import { flushOfflineQueue, useOfflineStore } from "@/offline/store";

export function OfflineBanner() {
  const online = useOfflineStore((state) => state.online);
  const queuedCount = useOfflineStore((state) => state.queuedCount);

  useEffect(() => {
    const flush = () => {
      void flushOfflineQueue(async (item) => {
        await apiClient.request({
          method: item.method,
          url: item.path,
          data: item.body,
          skipOfflineQueue: true,
        } as { skipOfflineQueue?: boolean });
      });
    };
    flush();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    return () => sub.remove();
  }, []);

  if (online && queuedCount === 0) return null;

  return (
    <View className="border-b border-glass bg-glass-card px-3 py-1.5 dark:border-dark-glass dark:bg-dark-glass-card">
      <Text className="text-center text-[11px] font-bold text-primary/70 dark:text-dark-primary/70">
        {online
          ? "Syncing changes made while you were offline..."
          : "You're offline. Projects, tasks, and boards stay available and will sync when you're back."}
      </Text>
    </View>
  );
}
