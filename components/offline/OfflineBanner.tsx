"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  flushOfflineQueue,
  getOfflineServerSnapshot,
  getOfflineSnapshot,
  subscribeOfflineStatus,
} from "@/lib/offline/store";
import { apiFetch } from "@/lib/api/client";

export function OfflineBanner() {
  const status = useSyncExternalStore(
    subscribeOfflineStatus,
    getOfflineSnapshot,
    getOfflineServerSnapshot,
  );

  useEffect(() => {
    if (!status.online) return;
    void flushOfflineQueue(async (item) => {
      await apiFetch(item.path, {
        method: item.method,
        body: item.body,
        skipOfflineQueue: true,
      });
    });
  }, [status.online]);

  if (status.online && status.queuedCount === 0) return null;

  return (
    <div className="border-b border-glass bg-glass-card px-4 py-1.5 text-center text-xs font-medium text-primary/70">
      {status.online
        ? "Syncing changes made while you were offline…"
        : "You're offline. Projects, tasks, and boards stay available and will sync when you're back."}
    </div>
  );
}
