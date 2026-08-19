"use client";

import { useEffect, useState } from "react";
import {
  getSystemStatusApi,
  systemSettingsRowToStatus,
  type SystemStatus,
} from "@/lib/api/admin";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";

export function SystemStatusBanner() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: SystemStatus | null) => {
      if (!cancelled && next) setStatus(next);
    };

    const load = () => {
      getSystemStatusApi()
        .then(apply)
        .catch(() => {});
    };

    load();

    const supabase = getSupabaseRealtimeClient();
    if (!supabase) {
      const timer = window.setInterval(load, 60_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel("system-status")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "system_settings",
          filter: "id=eq.default",
        },
        (payload) => {
          apply(systemSettingsRowToStatus(payload.new as Record<string, unknown>));
        },
      )
      .subscribe((channelStatus) => {
        if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          load();
        }
      });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  if (!status) return null;

  const maintenance = status.maintenanceMode
    ? "Nova is currently undergoing scheduled maintenance."
    : null;
  const banner = status.banner?.trim() || null;
  if (!maintenance && !banner) return null;

  return (
    <div className="border-b border-accent/30 bg-accent/12 px-4 py-2 text-center text-xs font-medium text-accent">
      {[maintenance, banner].filter(Boolean).join(" — ")}
    </div>
  );
}
