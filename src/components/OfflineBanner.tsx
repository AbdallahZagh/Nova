import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import { probeApiHealth, syncOfflineQueue } from "@/api/apiClient";
import { useOfflineStore } from "@/offline/store";

export function OfflineBanner() {
  const online = useOfflineStore((state) => state.online);
  const queuedCount = useOfflineStore((state) => state.queuedCount);

  useEffect(() => {
    const recover = (force = false) => {
      const state = useOfflineStore.getState();
      if (!force && state.online && state.queuedCount === 0) return;
      void probeApiHealth().then((ok) => {
        if (!ok && state.queuedCount > 0) void syncOfflineQueue();
      });
    };
    recover(true);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") recover(true);
    });
    const timer = setInterval(() => recover(false), 15_000);
    return () => {
      appState.remove();
      clearInterval(timer);
    };
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
