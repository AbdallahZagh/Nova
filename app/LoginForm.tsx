"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { establishSession } from "@/app/actions/session";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { loginApi } from "@/lib/api/auth";
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
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-primary/80"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
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
