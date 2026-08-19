"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { formatAdminDate } from "@/components/admin/admin-ui";
import { AdminAuditSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminAuditPage() {
  const { toast } = useToast();
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextAction = action, nextPage = page) => {
    const result = await adminApi.audit(nextPage, nextAction);
    setRows(result.data);
    setTotal(result.total);
    setLoading(false);
  }, [action, page]);

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      toast({
        variant: "error",
        title: "Could not load audit log",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [load, toast]);

  if (loading) {
    return <AdminAuditSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Audit</h1>
        <p className="mt-1 text-sm text-primary/55">
          Append-only log of Super Admin actions. Session revoke lives on the user drawer.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          load(action, 1).catch(() => {});
        }}
      >
        <Input
          placeholder="Filter by action (e.g. USER_SUSPEND)"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <Button type="submit" variant="accent" className="shrink-0">
          Filter
        </Button>
      </form>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary/45">
              <tr>
                <th className="pb-3 pr-4">When</th>
                <th className="pb-3 pr-4">Actor</th>
                <th className="pb-3 pr-4">Action</th>
                <th className="pb-3 pr-4">Target</th>
                <th className="pb-3">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const actor = row.actor as { fullName?: string; email?: string } | undefined;
                return (
                  <tr key={String(row.id)} className="border-t border-glass align-top">
                    <td className="py-3 pr-4">{formatAdminDate(String(row.createdAt ?? ""))}</td>
                    <td className="py-3 pr-4">
                      <p>{actor?.fullName ?? "—"}</p>
                      <p className="text-xs text-primary/45">{actor?.email}</p>
                    </td>
                    <td className="py-3 pr-4 font-medium">{String(row.action)}</td>
                    <td className="py-3 pr-4 text-xs text-primary/60">
                      {String(row.targetType ?? "")}
                      {row.targetId ? ` · ${String(row.targetId)}` : ""}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-primary/50">
                      {row.metadata ? JSON.stringify(row.metadata) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-primary/50">
          <span>{total} events</span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                load(action, next).catch(() => {});
              }}
            >
              Previous
            </Button>
            <Button
              disabled={page * 30 >= total}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(action, next).catch(() => {});
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
