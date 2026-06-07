"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Input, PasswordInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setError("Google sign-in failed. Please try again.");
      toast({
        variant: "error",
        title: "Sign in failed",
        message: "Could not complete Google sign-in.",
      });
    }
  }, [searchParams, toast]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const message = authError.message ?? "Unable to sign in. Check your credentials.";
        setError(message);
        toast({ variant: "error", title: "Sign in failed", message });
        return;
      }

      toast({ variant: "success", title: "Welcome back" });
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
    <div className="space-y-4">
      <GoogleSignInButton />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-glass" />
        <span className="text-xs text-primary/45">or</span>
        <div className="h-px flex-1 bg-glass" />
      </div>

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
          <a
            href="/forgot-password"
            className="text-xs text-accent/80 underline-offset-2 hover:underline"
          >
            Forgot password?
          </a>
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
        {pending ? "Signing in…" : "Sign in with email"}
      </button>
    </form>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormContent />
    </Suspense>
  );
}
