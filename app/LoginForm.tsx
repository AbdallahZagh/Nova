"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { establishSession } from "@/app/actions/session";
import { Input, PasswordInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { loginApi, reactivateApi } from "@/lib/api/auth";
import { getDemoCredentialsApi } from "@/lib/demo";
import { ApiError, setAccessToken } from "@/lib/api/client";
import { looksLikeEmail } from "@/lib/username";

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
  const [demoPending, setDemoPending] = useState(false);
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
    const identifier = String(formData.get("identifier") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const response = await loginApi(identifier, password);
      const accessToken = response.accessToken ?? response.access_token;
      if (!accessToken) {
        throw new ApiError(
          "Login succeeded but no access token was returned.",
          500,
          response,
        );
      }
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
      setAccessToken(accessToken);
      await establishSession();

      toast({ variant: "success", title: "Welcome back" });
      router.push(searchParams.get("from") ?? "/dashboard");
      router.refresh();
    } catch (err) {
      if (isInactiveAccountError(err)) {
        if (!looksLikeEmail(identifier)) {
          const message =
            err instanceof ApiError
              ? err.message
              : "This account needs to be reactivated with the email on file.";
          setError(message);
          toast({ variant: "error", title: "Sign in failed", message });
          return;
        }
        try {
          const reactivateResponse = await reactivateApi(identifier);
          toast({
            variant: "success",
            title: "Reactivation code sent",
            message:
              reactivateResponse._devOtp
                ? `Your code: ${reactivateResponse._devOtp}`
                : "Check your email for the OTP.",
          });
          router.push(`/reactivate?email=${encodeURIComponent(identifier)}&step=otp`);
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

  async function handleDemoLogin() {
    setError(undefined);
    setDemoPending(true);
    try {
      const demo = await getDemoCredentialsApi();
      const response = await loginApi(demo.email, demo.password);
      const accessToken = response.accessToken ?? response.access_token;
      if (!accessToken) {
        throw new ApiError("Demo login did not return a token.", 500, response);
      }
      setAccessToken(accessToken);
      await establishSession();
      toast({
        variant: "success",
        title: "Demo workspace",
        message: "A short tour will explain what you can try.",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Demo sign-in is unavailable right now.";
      setError(message);
      toast({ variant: "error", title: "Demo unavailable", message });
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="identifier"
          className="mb-1.5 block text-sm font-medium text-primary/80"
        >
          Email or username
        </label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          variant="soft"
          placeholder="you@company.com or @username"
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
        disabled={pending || demoPending}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <button
        type="button"
        disabled={pending || demoPending}
        onClick={() => void handleDemoLogin()}
        className="w-full rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary transition hover:text-accent disabled:opacity-60"
      >
        {demoPending ? "Opening demo..." : "Try demo"}
      </button>
      <p className="text-center text-xs text-primary/50">
        Shared sandbox for portfolios. No email required.
      </p>
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
