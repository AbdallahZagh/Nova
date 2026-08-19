"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import { formatAdminDate } from "@/components/admin/admin-ui";
import {
  AdminUserDrawerSkeleton,
  AdminUsersSkeleton,
} from "@/components/skeletons/AdminSkeleton";
import { adminApi, type AdminUserRow } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

function actionsForUser(detail: Record<string, unknown>) {
  const status = String(detail.status ?? "");
  const role = String(detail.role ?? "");
  const isDemo = Boolean(detail.isDemo);
  const pendingOtps = Array.isArray(detail.pendingOtps) ? detail.pendingOtps : [];
  const actions: Array<{
    id: string;
    label: string;
    variant?: "danger" | "default";
  }> = [];

  if (isDemo) {
    actions.push({ id: "reset-demo", label: "Reset demo" });
    return actions;
  }

  if (status === "ACTIVE") {
    actions.push({ id: "suspend", label: "Suspend", variant: "danger" });
  } else if (status === "SUSPENDED") {
    actions.push({ id: "reinstate", label: "Reinstate" });
  }

  if (pendingOtps.length > 0) {
    actions.push({ id: "verify-otp", label: "Verify OTP" });
  }

  if (role === "USER") {
    actions.push({ id: "promote", label: "Promote" });
  } else if (role === "SUPER_ADMIN") {
    actions.push({ id: "demote", label: "Demote", variant: "danger" });
  }

  actions.push({ id: "revoke-tokens", label: "Revoke sessions" });
  return actions;
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextQuery = query, nextPage = page) => {
    const result = await adminApi.users(nextQuery, nextPage);
    setRows(result.data);
    setTotal(result.total);
    setLoading(false);
  }, [page, query]);

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      toast({
        variant: "error",
        title: "Could not load users",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [load, toast]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    adminApi
      .user(selectedId)
      .then(setDetail)
      .catch((error) => {
        toast({
          variant: "error",
          title: "Could not load user",
          message: error instanceof ApiError ? error.message : "Try again.",
        });
      });
  }, [selectedId, toast]);

  async function runAction(action: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await adminApi.action(selectedId, action);
      toast({
        variant: "success",
        title: "Done",
        message:
          typeof result === "object" && result && "message" in result
            ? String((result as { message: unknown }).message)
            : "Updated.",
      });
      const next = await adminApi.user(selectedId);
      setDetail(next);
      await load();
    } catch (error) {
      toast({
        variant: "error",
        title: "Action failed",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <AdminUsersSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Users</h1>
        <p className="mt-1 text-sm text-primary/55">
          Metadata only — no boards, tasks, or comments.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          load(query, 1).catch(() => {});
        }}
      >
        <Input
          placeholder="Search name, email, username, or id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button variant="accent" type="submit" className="shrink-0">
          Search
        </Button>
      </form>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary/45">
              <tr>
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-glass hover:bg-glass-button/50"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium text-primary">{row.fullName}</p>
                    <p className="text-xs text-primary/50">{row.email}</p>
                  </td>
                  <td className="py-3 pr-4 text-primary/70">{row.role}</td>
                  <td className="py-3 pr-4 text-primary/70">{row.status}</td>
                  <td className="py-3 pr-4 text-primary/60">
                    {formatAdminDate(row.createdAt)}
                  </td>
                  <td className="py-3 text-primary/60">
                    {formatAdminDate(row.lastActiveAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-primary/50">
          <span>{total} accounts</span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                load(query, next).catch(() => {});
              }}
            >
              Previous
            </Button>
            <Button
              disabled={page * 20 >= total}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(query, next).catch(() => {});
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </GlassCard>

      <SideDrawer
        isOpen={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title="User metadata"
      >
        {detail ? (
          <div className="flex flex-col gap-4 text-sm">
            <p className="font-semibold text-primary">
              {String(detail.fullName ?? "")}
            </p>
            <p className="text-primary/55">{String(detail.email ?? "")}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-primary/45">Status</dt>
                <dd>{String(detail.status ?? "")}</dd>
              </div>
              <div>
                <dt className="text-primary/45">Role</dt>
                <dd>{String(detail.role ?? "")}</dd>
              </div>
              <div>
                <dt className="text-primary/45">Projects</dt>
                <dd>{String(detail.projectCount ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-primary/45">Tasks</dt>
                <dd>{String(detail.taskCount ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-primary/45">Boards</dt>
                <dd>{String(detail.boardCount ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-primary/45">Last active</dt>
                <dd>{formatAdminDate(String(detail.lastActiveAt ?? ""))}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-primary/45">
                Devices
              </p>
              <ul className="space-y-1 text-xs text-primary/70">
                {Array.isArray(detail.deviceTokens) && detail.deviceTokens.length
                  ? detail.deviceTokens.map((device) => {
                      const row = device as {
                        id: string;
                        platform?: string;
                        lastSeenAt?: string;
                      };
                      return (
                        <li key={row.id}>
                          {row.platform ?? "unknown"} · {formatAdminDate(row.lastSeenAt)}
                        </li>
                      );
                    })
                  : "No devices"}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-primary/45">
                Pending OTPs
              </p>
              <ul className="space-y-1 text-xs text-primary/70">
                {Array.isArray(detail.pendingOtps) && detail.pendingOtps.length
                  ? detail.pendingOtps.map((otp, index) => {
                      const row = otp as { purpose?: string; expiresAt?: string };
                      return (
                        <li key={`${row.purpose}-${index}`}>
                          {row.purpose} · expires {formatAdminDate(row.expiresAt)}
                        </li>
                      );
                    })
                  : "None"}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              {actionsForUser(detail).map((action) => (
                <Button
                  key={action.id}
                  disabled={busy}
                  variant={action.variant === "danger" ? "danger" : "secondary"}
                  onClick={() => void runAction(action.id)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <AdminUserDrawerSkeleton />
        )}
      </SideDrawer>
    </div>
  );
}
