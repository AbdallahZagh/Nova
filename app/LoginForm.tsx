"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { establishSession } from "@/app/actions/session";
import { Input, PasswordInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { loginApi } from "@/lib/api/auth";
import { isAccountDeactivatedError } from "@/lib/auth-errors";
import { ApiError } from "@/lib/api/client";
import { setAccessToken } from "@/lib/api/client";
import { apiUserToProfile } from "@/lib/api/user-mapper";

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const { accessToken, user } = await loginApi(email, password);
      setAccessToken(accessToken);
      await establishSession();
      toast({
        variant: "success",
        title: "Welcome back",
        message: `Signed in as ${apiUserToProfile(user).name}`,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (isAccountDeactivatedError(err)) {
        const params = new URLSearchParams();
        if (email) params.set("email", email);
        const query = params.toString();
        router.push(query ? `/reactivate?${query}` : "/reactivate");
        return;
      }
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to sign in. Check your connection and try again.";
      setError(message);
      toast({ variant: "error", title: "Sign in failed", message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-primary/80"
        >
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          variant="soft"
          placeholder="you@company.com"
          className="bg-main/60"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-sm font-medium text-primary/80"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-accent/80 underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          variant="soft"
          placeholder="••••••••"
          className="bg-main/60"
        />
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
