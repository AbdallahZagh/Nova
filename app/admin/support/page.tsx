"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { formatAdminDate } from "@/components/admin/admin-ui";
import { AdminSupportSkeleton } from "@/components/skeletons/AdminSkeleton";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

function AdminSupportInner() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("ticket"),
  );
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (priority) params.priority = priority;
    const result = await adminApi.tickets(params);
    setTickets(result.data);
    setLoading(false);
  }, [priority, status]);

  const loadTicket = useCallback(async (id: string) => {
    const next = await adminApi.ticket(id);
    setTicket(next);
  }, []);

  useEffect(() => {
    loadList().catch((error) => {
      setLoading(false);
      toast({
        variant: "error",
        title: "Could not load tickets",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [loadList, toast]);

  useEffect(() => {
    const fromQuery = searchParams.get("ticket");
    if (fromQuery) setSelectedId(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      return;
    }
    loadTicket(selectedId).catch((error) => {
      toast({
        variant: "error",
        title: "Could not open ticket",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    });
  }, [loadTicket, selectedId, toast]);

  async function sendReply(resolve: boolean) {
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    try {
      await adminApi.replyTicket(selectedId, reply.trim(), resolve);
      setReply("");
      await Promise.all([loadTicket(selectedId), loadList()]);
      toast({
        variant: "success",
        title: resolve ? "Sent and resolved" : "Email sent",
        message: "The user was emailed.",
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Reply failed",
        message: error instanceof ApiError ? error.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const user = (ticket?.user as { fullName?: string; email?: string } | undefined) ?? {};
  const attachments = (ticket?.attachments as Array<{ id: string; imageUrl?: string }>) ?? [];
  const replies =
    (ticket?.replies as Array<{
      id: string;
      body: string;
      channel: string;
      createdAt: string;
    }>) ?? [];

  if (loading) {
    return <AdminSupportSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Support</h1>
        <p className="mt-1 text-sm text-primary/55">
          Inbox for product reports. Email replies do not auto-resolve unless you choose that.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full min-w-[180px] sm:w-56">
          <label
            htmlFor="support-status-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Status
          </label>
          <Select
            id="support-status-filter"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "All statuses" },
              { value: "OPEN", label: "OPEN" },
              { value: "IN_PROGRESS", label: "IN_PROGRESS" },
              { value: "AWAITING_USER", label: "AWAITING_USER" },
              { value: "RESOLVED", label: "RESOLVED" },
              { value: "CLOSED", label: "CLOSED" },
            ]}
            aria-label="Filter by status"
          />
        </div>
        <div className="w-full min-w-[180px] sm:w-56">
          <label
            htmlFor="support-priority-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Priority
          </label>
          <Select
            id="support-priority-filter"
            value={priority}
            onChange={setPriority}
            options={[
              { value: "", label: "All priorities" },
              { value: "LOW", label: "LOW" },
              { value: "NORMAL", label: "NORMAL" },
              { value: "HIGH", label: "HIGH" },
              { value: "URGENT", label: "URGENT" },
            ]}
            aria-label="Filter by priority"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <GlassCard title="Tickets">
          <ul className="space-y-2">
            {tickets.map((row) => {
              const reporter = row.user as { fullName?: string } | undefined;
              return (
                <li key={String(row.id)}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(String(row.id))}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      selectedId === row.id
                        ? "border-accent/40 bg-accent/10"
                        : "border-glass bg-glass-button/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-primary">{String(row.title)}</p>
                    <p className="mt-1 text-xs text-primary/50">
                      {reporter?.fullName ?? "Unknown"} · {String(row.priority)} ·{" "}
                      {String(row.status)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard title="Conversation">
          {ticket ? (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="text-lg font-semibold text-primary">{String(ticket.title)}</p>
                <p className="text-xs text-primary/50">
                  {user.fullName} · {user.email} · {String(ticket.priority)} ·{" "}
                  {String(ticket.status)}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-primary/80">{String(ticket.body)}</p>
              <p className="text-xs text-primary/45">
                {String(ticket.platform ?? "web")} · {String(ticket.route ?? "—")} ·{" "}
                {String(ticket.appVersion ?? "—")}
              </p>
              {attachments.length ? (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file) =>
                    file.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={file.id}
                        src={file.imageUrl}
                        alt="Attachment"
                        className="h-24 rounded-lg border border-glass object-cover"
                      />
                    ) : null,
                  )}
                </div>
              ) : null}
              <div className="space-y-3">
                {replies.map((item) => (
                  <div key={item.id} className="rounded-xl border border-glass bg-glass-button/40 p-3">
                    <p className="text-xs text-primary/45">
                      {item.channel} · {formatAdminDate(item.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
                  </div>
                ))}
              </div>
              <Textarea
                rows={4}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Email reply to the reporter"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} variant="accent" onClick={() => void sendReply(false)}>
                  Send email
                </Button>
                <Button disabled={busy} onClick={() => void sendReply(true)}>
                  Send and resolve
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-primary/50">Select a ticket.</p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<AdminSupportSkeleton />}>
      <AdminSupportInner />
    </Suspense>
  );
}
