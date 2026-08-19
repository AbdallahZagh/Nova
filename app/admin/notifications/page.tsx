"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { formatAdminDate } from "@/components/admin/admin-ui";
import { AdminBroadcastsSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [scope, setScope] = useState("ALL");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [inApp, setInApp] = useState(true);
  const [fcm, setFcm] = useState(false);
  const [email, setEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setRows(await adminApi.broadcasts());
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setLoading(false);
      toast({
        variant: "error",
        title: "Could not load broadcasts",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [load, toast]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      await adminApi.sendBroadcast({
        scope,
        title: title.trim(),
        body: body.trim(),
        actionUrl: actionUrl.trim() || undefined,
        inApp,
        fcm,
        email,
        ...(scope === "USER" ? { targetUserId: targetUserId.trim() } : {}),
        ...(scope === "PROJECT" ? { targetProjectId: targetProjectId.trim() } : {}),
      });
      setTitle("");
      setBody("");
      setActionUrl("");
      await load();
      toast({ variant: "success", title: "Broadcast sent", message: "Delivery is logged below." });
    } catch (error) {
      toast({
        variant: "error",
        title: "Broadcast failed",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <AdminBroadcastsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Broadcasts</h1>
        <p className="mt-1 text-sm text-primary/55">
          Send in-app, push, and email messages. Tap rates come from notification opens.
        </p>
      </div>

      <GlassCard title="Composer">
        <form className="flex flex-col gap-3" onSubmit={send}>
          <Select
            value={scope}
            onChange={setScope}
            options={[
              { value: "ALL", label: "All users" },
              { value: "USER", label: "One user" },
              { value: "PROJECT", label: "Project members" },
            ]}
            aria-label="Broadcast scope"
          />
          {scope === "USER" ? (
            <Input
              placeholder="Target user id"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              required
            />
          ) : null}
          {scope === "PROJECT" ? (
            <Input
              placeholder="Target project id"
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              required
            />
          ) : null}
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <Textarea
            rows={4}
            placeholder="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <Input
            placeholder="Action URL (optional)"
            value={actionUrl}
            onChange={(event) => setActionUrl(event.target.value)}
          />
          <MultiSelect
            value={[
              ...(inApp ? ["inApp"] : []),
              ...(fcm ? ["fcm"] : []),
              ...(email ? ["email"] : []),
            ]}
            onChange={(next) => {
              setInApp(next.includes("inApp"));
              setFcm(next.includes("fcm"));
              setEmail(next.includes("email"));
            }}
            options={[
              { value: "inApp", label: "In-app" },
              { value: "fcm", label: "Push" },
              { value: "email", label: "Email" },
            ]}
            placeholder="Delivery channels"
            aria-label="Delivery channels"
          />
          <Button type="submit" variant="accent" className="w-fit" disabled={sending}>
            Send broadcast
          </Button>
        </form>
      </GlassCard>

      <GlassCard title="Delivery log">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary/45">
              <tr>
                <th className="pb-3 pr-4">Title</th>
                <th className="pb-3 pr-4">Scope</th>
                <th className="pb-3 pr-4">Sent</th>
                <th className="pb-3 pr-4">Failed</th>
                <th className="pb-3 pr-4">Opened</th>
                <th className="pb-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-glass">
                  <td className="py-3 pr-4">{String(row.title)}</td>
                  <td className="py-3 pr-4">{String(row.scope)}</td>
                  <td className="py-3 pr-4">{String(row.sentCount ?? 0)}</td>
                  <td className="py-3 pr-4">{String(row.failedCount ?? 0)}</td>
                  <td className="py-3 pr-4">
                    {String(row.openedCount ?? 0)} (
                    {Math.round(Number(row.tapRate ?? 0) * 100)}%)
                  </td>
                  <td className="py-3">{formatAdminDate(String(row.createdAt ?? ""))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
