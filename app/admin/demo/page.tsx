"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useToast } from "@/components/ui/Toast";
import { MetricCard, formatAdminDate } from "@/components/admin/admin-ui";
import { AdminDemoSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminDemoPage() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    Promise.all([adminApi.demoOverview(), adminApi.demoSessions()])
      .then(([nextOverview, nextSessions]) => {
        setOverview(nextOverview);
        setSessions(nextSessions.data);
      })
      .catch((error) => {
        toast({
          variant: "error",
          title: "Could not load demo analytics",
          message: error instanceof ApiError ? error.message : "Try again.",
        });
      });
  }, [toast]);

  if (!overview) {
    return <AdminDemoSkeleton />;
  }

  const blocked = (overview.blockedActions as Array<{ action: string; count: number }>) ?? [];
  const summaries =
    (overview.summaries as Array<{
      day: string;
      sessionCount?: number;
      uniqueVisitors?: number;
    }>) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Demo</h1>
        <p className="mt-1 text-sm text-primary/55">
          Visit analytics for the shared demo workspace. Nightly reseed still runs after summary.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Sessions today" value={Number(overview.sessionsToday ?? 0)} />
        <MetricCard label="Sessions this week" value={Number(overview.sessionsWeek ?? 0)} />
        <MetricCard
          label="Unique visitors / week"
          value={Number(overview.uniqueVisitorsWeek ?? 0)}
        />
        <MetricCard label="Live sessions" value={Number(overview.liveSessions ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Blocked actions (7 days)">
          {blocked.length === 0 ? (
            <p className="text-sm text-primary/50">None recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {blocked.map((row) => (
                <li key={row.action} className="flex justify-between text-primary/80">
                  <span>{row.action}</span>
                  <span>{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard title="Daily summaries">
          {summaries.length === 0 ? (
            <p className="text-sm text-primary/50">No summaries yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {summaries.map((row) => (
                <li key={row.day} className="flex justify-between text-primary/80">
                  <span>{formatAdminDate(row.day)}</span>
                  <span>
                    {row.sessionCount ?? 0} sessions · {row.uniqueVisitors ?? 0} visitors
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard title="Recent sessions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary/45">
              <tr>
                <th className="pb-3 pr-4">Started</th>
                <th className="pb-3 pr-4">Platform</th>
                <th className="pb-3 pr-4">Requests</th>
                <th className="pb-3 pr-4">Mutations</th>
                <th className="pb-3">Blocked</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={String(session.id)} className="border-t border-glass">
                  <td className="py-3 pr-4">{formatAdminDate(String(session.startedAt ?? ""))}</td>
                  <td className="py-3 pr-4">{String(session.platform ?? "—")}</td>
                  <td className="py-3 pr-4">{String(session.requestCount ?? 0)}</td>
                  <td className="py-3 pr-4">{String(session.mutationCount ?? 0)}</td>
                  <td className="py-3">{String(session.blockedCount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
