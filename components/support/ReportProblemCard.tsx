"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { createSupportTicketApi } from "@/lib/api/admin";

export function ReportProblemCard() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("BUG");
  const [priority, setPriority] = useState("NORMAL");
  const [file, setFile] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    try {
      await createSupportTicketApi({
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        route: pathname,
        platform: "web",
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
        file,
      });
      setTitle("");
      setBody("");
      setFile(undefined);
      toast({
        variant: "success",
        title: "Report sent",
        message: "Thanks — we’ll look into it.",
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not send report",
        message:
          error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard title="Report a problem">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <p className="text-xs text-primary/55">
          Send a screenshot and details to Super Admins. Urgent reports notify
          them immediately.
        </p>
        <Input
          placeholder="What’s going wrong?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <Textarea
          placeholder="Steps to reproduce, what you expected, and what happened."
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          required
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm text-primary"
          >
            <option value="BUG">Bug</option>
            <option value="FEATURE_REQUEST">Feature request</option>
            <option value="ACCOUNT">Account</option>
            <option value="OTHER">Other</option>
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded-xl border border-glass bg-glass-button px-3 py-2 text-sm text-primary"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setFile(event.target.files?.[0])}
          className="text-xs text-primary/60"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <LifeBuoy className="size-4" />}
          Send report
        </button>
      </form>
    </GlassCard>
  );
}
