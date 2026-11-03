"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/app/LoginForm";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { clearAccessToken, getAccessToken } from "@/lib/api/client";

type ConnectionRequest = {
  clientName: string;
  redirectHost: string;
  expiresAt: string;
};

type Phase = "loading" | "sign-in" | "consent" | "error";

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body && "message" in body) {
    const message = (body as { message: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : String(message);
  }
  return fallback;
}

export function ConnectConsent() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request");
  const returnTo = requestId
    ? `/connect?request=${encodeURIComponent(requestId)}`
    : "/connect";
  const [phase, setPhase] = useState<Phase>(requestId ? "loading" : "error");
  const [request, setRequest] = useState<ConnectionRequest | null>(null);
  const [error, setError] = useState(
    requestId ? "" : "This connection link is incomplete. Start again from your agent.",
  );
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const token = getAccessToken();
      if (!token) {
        setPhase("sign-in");
        return;
      }

      const response = await fetch(`/api/oauth/requests/${requestId}`);
      const body: unknown = await response.json().catch(() => null);
      if (cancelled) return;
      if (response.status === 401) {
        clearAccessToken();
        setPhase("sign-in");
        return;
      }
      if (!response.ok) {
        setError(errorMessage(body, "This connection request is no longer valid."));
        setPhase("error");
        return;
      }
      setRequest(body as ConnectionRequest);
      setPhase("consent");
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, sessionVersion]);

  async function decide(decision: "approve" | "deny") {
    if (!requestId) return;
    setPending(decision === "approve" ? "allow" : "deny");
    setError("");
    const token = getAccessToken();
    const response = await fetch(`/api/oauth/requests/${requestId}/${decision}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401) {
      clearAccessToken();
      setPending(null);
      setPhase("sign-in");
      return;
    }
    if (!response.ok) {
      setPending(null);
      setError(errorMessage(body, "Nova could not finish this connection."));
      return;
    }
    const redirectTo =
      typeof body === "object" && body && "redirectTo" in body
        ? String((body as { redirectTo: unknown }).redirectTo)
        : "";
    if (!redirectTo) {
      setPending(null);
      setError("Nova could not return you to the agent.");
      return;
    }
    window.location.assign(redirectTo);
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-main px-4 py-12 text-primary">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary/50">
          Nova
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Connect an agent
        </h1>
        <p className="mt-2 text-sm text-primary/60">
          Agents use your Nova account only after you allow it here.
        </p>
      </div>

      <GlassCard className="w-full max-w-md">
        {phase === "loading" ? (
          <p className="text-sm text-primary/60">Checking this connection...</p>
        ) : null}

        {phase === "sign-in" ? (
          <div className="space-y-4">
            <p className="text-sm text-primary/70">
              Sign in to Nova, then choose whether this agent can use your workspace.
            </p>
            <LoginForm
              returnTo={returnTo}
              onAuthenticated={() => {
                setPhase("loading");
                setSessionVersion((version) => version + 1);
              }}
            />
          </div>
        ) : null}

        {phase === "consent" && request ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-primary/55">Requesting access</p>
              <p className="mt-1 text-lg font-semibold">{request.clientName}</p>
              <p className="mt-1 text-xs text-primary/45">
                Returns to {request.redirectHost}
              </p>
            </div>
            <div className="rounded-xl border border-glass bg-main/50 px-4 py-3 text-sm text-primary/80">
              Read and update your projects, tasks, comments, and members.
            </div>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void decide("approve")}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending === "allow" ? "Connecting..." : "Allow"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void decide("deny")}
              className="w-full rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary transition hover:text-accent disabled:opacity-60"
            >
              {pending === "deny" ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        ) : null}

        {phase === "error" ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </GlassCard>
    </div>
  );
}
