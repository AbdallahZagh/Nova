"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { MetricCard } from "@/components/admin/admin-ui";
import { AdminAiSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminAiPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId] = useState("");
  const [dailyLimit, setDailyLimit] = useState("20");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setData(await adminApi.aiUsage());
  }, []);

  useEffect(() => {
    load().catch((error) => {
      toast({
        variant: "error",
        title: "Could not load AI usage",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [load, toast]);

  async function saveQuota(event: React.FormEvent) {
    event.preventDefault();
    if (!userId.trim()) return;
    setSaving(true);
    try {
      await adminApi.setQuota(userId.trim(), Math.max(0, Number(dailyLimit) || 0));
      setUserId("");
      await load();
      toast({ variant: "success", title: "Quota saved", message: "Per-user override updated." });
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not save quota",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAi(aiEnabled: boolean) {
    setSaving(true);
    try {
      await adminApi.patchSettings({ aiEnabled });
      await load();
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not update kill switch",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <AdminAiSkeleton />;

  const settings = (data.settings as { aiEnabled?: boolean; defaultAiDailyQuota?: number }) ?? {};
  const byUser =
    (data.byUser as Array<{ userId: string; _count?: { userId: number } }>) ?? [];
  const quotas =
    (data.quotas as Array<{ userId: string; dailyLimit: number }>) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">AI</h1>
        <p className="mt-1 text-sm text-primary/55">
          Usage, kill switch, and per-user daily limits. Demo accounts are hardcoded to 0.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Calls today" value={Number(data.today ?? 0)} />
        <MetricCard label="Calls this month" value={Number(data.month ?? 0)} />
        <MetricCard
          label="Default daily quota"
          value={Number(settings.defaultAiDailyQuota ?? 20)}
        />
      </div>

      <GlassCard title="Kill switch">
        <Switch
          label="Gemini enabled"
          description="Turns off AI features for every non-admin request."
          checked={Boolean(settings.aiEnabled)}
          disabled={saving}
          onChange={(next) => void toggleAi(next)}
        />
      </GlassCard>

      <GlassCard title="Per-user quota override">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={saveQuota}>
          <Input
            placeholder="User id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            required
          />
          <Input
            type="number"
            min={0}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
          />
          <Button type="submit" variant="accent" className="shrink-0" disabled={saving}>
            Save
          </Button>
        </form>
        <ul className="mt-4 space-y-2 text-sm">
          {quotas.map((row) => (
            <li key={row.userId} className="flex justify-between text-primary/80">
              <span className="font-mono text-xs">{row.userId}</span>
              <span>{row.dailyLimit}/day</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard title="Usage by user (month)">
        {byUser.length === 0 ? (
          <p className="text-sm text-primary/50">No usage yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {byUser.map((row) => (
              <li key={row.userId} className="flex justify-between text-primary/80">
                <span className="font-mono text-xs">{row.userId}</span>
                <span>{row._count?.userId ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
