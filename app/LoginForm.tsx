"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { establishSession } from "@/app/actions/session";
import { Input, PasswordInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { loginApi, reactivateApi } from "@/lib/api/auth";
import { ApiError, setAccessToken } from "@/lib/api/client";

function isInactiveAccountError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("inactive") ||
    message.includes("archived") ||
    message.includes("archive") ||
    message.includes("reactivat") ||
    message.includes("deactivated") ||
    message.includes("account is not active")
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const showedExpiredToast = useRef(false);

  useEffect(() => {
    if (showedExpiredToast.current) return;
    if (searchParams.get("reason") !== "session_expired") return;
    showedExpiredToast.current = true;
    toast({
      variant: "warning",
      title: "Session expired",
      message: "Your token expired. Please log in again.",
    });
  }, [searchParams, toast]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const response = await loginApi(email, password);
      const loginUser = response.user as typeof response.user & {
        isActive?: boolean;
        isArchived?: boolean;
      };
      if (
        loginUser.isActive === false ||
        loginUser.isArchived === true
      ) {
        const reactivateResponse = await reactivateApi(loginUser.email);
        toast({
          variant: "success",
          title: "Reactivation code sent",
          message:
            reactivateResponse._devOtp
              ? `Your code: ${reactivateResponse._devOtp}`
              : "Check your email for the OTP.",
        });
        router.push(
          `/reactivate?email=${encodeURIComponent(loginUser.email)}&step=otp`,
        );
        return;
      }
      setAccessToken(response.accessToken);
      await establishSession();

      toast({ variant: "success", title: "Welcome back" });
      router.push(searchParams.get("from") ?? "/dashboard");
      router.refresh();
    } catch (err) {
      if (isInactiveAccountError(err)) {
        try {
          const reactivateResponse = await reactivateApi(email);
          toast({
            variant: "success",
            title: "Reactivation code sent",
            message:
              reactivateResponse._devOtp
                ? `Your code: ${reactivateResponse._devOtp}`
                : "Check your email for the OTP.",
          });
          router.push(`/reactivate?email=${encodeURIComponent(email)}&step=otp`);
          return;
        } catch (reactivateErr) {
          const message =
            reactivateErr instanceof ApiError
              ? reactivateErr.message
              : "Could not send a reactivation code. Please try again.";
          setError(message);
          toast({ variant: "error", title: "Reactivation failed", message });
          return;
        }
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
          placeholder="Password"
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
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormContent />
    </Suspense>
  );
}
