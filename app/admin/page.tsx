"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import {
  MetricCard,
  formatAdminDate,
  formatBytes,
} from "@/components/admin/admin-ui";
import { AdminOverviewSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi, type AdminOverview } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [banner, setBanner] = useState("");
  const [quota, setQuota] = useState("20");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const next = await adminApi.overview();
    setData(next);
    setBanner(next.settings.broadcastBanner ?? "");
    setQuota(String(next.settings.defaultAiDailyQuota ?? 20));
  }, []);

  useEffect(() => {
    load().catch((error) => {
      toast({
        variant: "error",
        title: "Could not load overview",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [load, toast]);

  async function patch(partial: Record<string, unknown>) {
    setSaving(true);
    try {
      await adminApi.patchSettings(partial);
      await load();
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not save settings",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <AdminOverviewSkeleton />;
  }

  const { counts, http, storage, settings, signupFunnel, integrations, crons } =
    data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Overview</h1>
        <p className="mt-1 text-sm text-primary/55">
          System health, flags, and signup funnel. No workspace contents.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Users" value={counts.users} hint={`${counts.activeUsers} active`} />
        <MetricCard label="Projects" value={counts.projects} />
        <MetricCard label="Tasks" value={counts.tasks} />
        <MetricCard label="Boards" value={counts.boards} />
        <MetricCard label="Open tickets" value={counts.openTickets} />
        <MetricCard label="AI calls today" value={counts.aiToday} />
        <MetricCard
          label="Requests / hour"
          value={http.requestsLastHour}
          hint={`${http.avgLatencyMs} ms avg · ${(http.errorRate * 100).toFixed(1)}% errors`}
        />
        <MetricCard
          label="Storage"
          value={storage.configured ? formatBytes(storage.bytes) : "Not configured"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Controls">
          <div className="flex flex-col gap-3">
            <Switch
              label="Maintenance mode"
              description="Product mutations return 503. Super Admin stays unlocked."
              checked={settings.maintenanceMode}
              disabled={saving}
              onChange={(maintenanceMode) => patch({ maintenanceMode })}
            />
            <Switch
              label="AI"
              description="Kill switch for Gemini. Demo quota is always 0."
              checked={settings.aiEnabled}
              disabled={saving}
              onChange={(aiEnabled) => patch({ aiEnabled })}
            />
            <Switch
              label="Registrations"
              description="Blocks new signups when off."
              checked={settings.registrationsEnabled}
              disabled={saving}
              onChange={(registrationsEnabled) => patch({ registrationsEnabled })}
            />
            <Switch
              label="Push (FCM)"
              checked={settings.fcmEnabled}
              disabled={saving}
              onChange={(fcmEnabled) => patch({ fcmEnabled })}
            />
            <Switch
              label="Whiteboard realtime"
              checked={settings.whiteboardRealtimeEnabled}
              disabled={saving}
              onChange={(whiteboardRealtimeEnabled) =>
                patch({ whiteboardRealtimeEnabled })
              }
            />
            <div className="flex flex-col gap-2">
              <label className="text-xs text-primary/55">Broadcast banner</label>
              <Textarea
                rows={2}
                value={banner}
                onChange={(event) => setBanner(event.target.value)}
              />
              <Button
                variant="accent"
                className="w-fit"
                disabled={saving}
                onClick={() => patch({ broadcastBanner: banner.trim() || null })}
              >
                Save banner
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-primary/55">Default AI daily quota</label>
                <Input
                  type="number"
                  min={0}
                  value={quota}
                  onChange={(event) => setQuota(event.target.value)}
                />
              </div>
              <Button
                className="shrink-0"
                disabled={saving}
                onClick={() =>
                  patch({ defaultAiDailyQuota: Math.max(0, Number(quota) || 0) })
                }
              >
                Save quota
              </Button>
            </div>
          </div>
        </GlassCard>

        <div className="flex flex-col gap-6">
          <GlassCard title="Signup funnel">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Registered" value={signupFunnel.registered} />
              <MetricCard label="Verified" value={signupFunnel.verified} />
              <MetricCard label="First project" value={signupFunnel.withProject} />
            </div>
          </GlassCard>
          <GlassCard title="Integrations">
            <ul className="space-y-2 text-sm">
              {Object.entries(integrations).map(([name, ok]) => (
                <li key={name} className="flex justify-between text-primary/80">
                  <span className="capitalize">{name}</span>
                  <span className={ok ? "text-emerald-400" : "text-primary/40"}>
                    {ok ? "Configured" : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard title="Cron jobs">
            {crons.length === 0 ? (
              <p className="text-sm text-primary/50">No cron runs recorded yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {crons.map((cron) => (
                  <li key={cron.name}>
                    <p className="font-medium text-primary">{cron.name}</p>
                    <p className="text-xs text-primary/50">
                      {cron.lastStatus ?? "unknown"} ·{" "}
                      {formatAdminDate(cron.lastFinishedAt ?? cron.lastStartedAt)}
                    </p>
                    {cron.lastError ? (
                      <p className="mt-1 text-xs text-red-400">{cron.lastError}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
