import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { createClient } from "@supabase/supabase-js";
import {
  getSystemStatusApi,
  systemSettingsRowToStatus,
  type SystemStatus,
} from "@/api/system";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/notifications";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

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

    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") load();
    });

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
          apply(
            systemSettingsRowToStatus(payload.new as Record<string, unknown>),
          );
        },
      )
      .subscribe((channelStatus) => {
        if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          load();
        }
      });

    return () => {
      cancelled = true;
      appState.remove();
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
    <View className="border-b border-accent/30 bg-accent/15 px-3 py-1.5 dark:border-dark-accent/30 dark:bg-dark-accent/15">
      <Text className="text-center text-[11px] font-bold text-accent dark:text-dark-accent">
        {[maintenance, banner].filter(Boolean).join(" — ")}
      </Text>
    </View>
  );
}
