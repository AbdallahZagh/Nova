"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  UserCheck,
} from "lucide-react";
import { establishSession } from "@/app/actions/session";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { reactivateApi, resendOtpApi, verifyOtpApi } from "@/lib/api/auth";
import { ApiError, setAccessToken } from "@/lib/api/client";
import { cn } from "@/lib/cn";

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = Array.from({ length: 6 }, () =>
    useRef<HTMLInputElement>(null),
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    idx: number,
  ) => {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    const chars = value.padEnd(6, " ").split("");
    chars[idx] = digit || " ";
    const next = chars.join("").trimEnd();
    onChange(next);
    if (digit && idx < 5) refs[idx + 1].current?.focus();
  };

  const handleKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted) {
      onChange(pasted);
      refs[Math.min(pasted.length, 5)].current?.focus();
    }
    e.preventDefault();
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={refs[idx]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[idx] ?? ""}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKey(e, idx)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "size-12 rounded-xl border border-glass bg-glass-button text-center text-lg font-bold text-primary outline-none transition",
            "focus:border-accent focus:ring-2 focus:ring-accent/20",
            "disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}

function StepDot({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-sm font-bold transition",
        done
          ? "bg-emerald-500/20 text-emerald-400"
          : active
            ? "bg-accent/25 text-accent ring-2 ring-accent/30"
            : "bg-glass-button text-primary/40",
      )}
    >
      {done ? <CheckCircle2 className="size-4" /> : n}
    </div>
  );
}

type Step = "email" | "otp" | "done";

function ReactivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const stepNum = step === "email" ? 1 : step === "otp" ? 2 : 3;
  const resendRemaining = Math.max(
    0,
    Math.ceil((otpCooldownUntil - now) / 1000),
  );

  useEffect(() => {
    if (!otpCooldownUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [otpCooldownUntil]);

  const requestCode = async () => {
    setEmailError("");
    setLoading(true);
    try {
      const res = await reactivateApi(email);
      if (res._devOtp) {
        toast({
          variant: "success",
          title: "OTP sent (dev mode)",
          message: `Your code: ${res._devOtp}`,
        });
      } else {
        toast({
          variant: "success",
          title: "Code sent",
          message:
            res.message ||
            "If an archived account exists for this email, a code was sent.",
        });
      }
      setOtp("");
      setOtpError("");
      const nextNow = Date.now();
      setOtpCooldownUntil(nextNow + 30_000);
      setNow(nextNow);
      setStep("otp");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not send reactivation code. Try again.";
      setEmailError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestCode();
  };

  const handleResendCode = async () => {
    if (resendRemaining > 0) return;
    setOtpError("");
    setLoading(true);
    try {
      const res = await resendOtpApi(email.trim(), "REACTIVATE");
      if (res._devOtp) {
        toast({
          variant: "success",
          title: "OTP resent (dev mode)",
          message: `Your code: ${res._devOtp}`,
        });
      } else {
        toast({
          variant: "success",
          title: "Code resent",
          message: res.message || "Check your inbox for the fresh code.",
        });
      }
      const nextNow = Date.now();
      setOtpCooldownUntil(nextNow + 30_000);
      setNow(nextNow);
    } catch (err) {
      setOtpError(
        err instanceof ApiError
          ? err.message
          : "Could not resend reactivation code. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    if (otp.replace(/\s/g, "").length < 6) {
      setOtpError("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOtpApi(email.trim(), otp.trim(), "REACTIVATE");
      if (!res.accessToken) {
        throw new Error("No access token returned. Please sign in manually.");
      }
      setAccessToken(res.accessToken);
      await establishSession();
      setStep("done");
      toast({
        variant: "success",
        title: "Welcome back!",
        message: res.message || "Your account has been reactivated.",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Invalid or expired code. Try again.";
      setOtpError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-main px-4 py-12 text-primary">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary/50">
          Account recovery
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Reactivate account
        </h1>
        <p className="mt-2 text-sm text-primary/60">
          Restore access to your archived Taskflow account
        </p>
      </div>

      <GlassCard className="w-full max-w-md space-y-6">
        {step !== "done" && (
          <div className="flex items-center justify-center gap-3">
            <StepDot n={1} active={step === "email"} done={stepNum > 1} />
            <div
              className={cn(
                "h-px w-10 transition",
                stepNum > 1 ? "bg-emerald-500/40" : "bg-glass",
              )}
            />
            <StepDot n={2} active={step === "otp"} done={step === "done"} />
          </div>
        )}

        {step === "email" && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <p className="text-sm text-primary/60">
              Enter the email for your archived account. We&apos;ll send a
              one-time code to verify it&apos;s you.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Email address
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                variant="soft"
                className="bg-main/60"
              />
              {emailError && (
                <p className="mt-1.5 text-xs text-red-400" role="alert">
                  {emailError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {loading ? "Sending…" : "Send reactivation code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="text-center">
              <p className="text-sm text-primary/60">
                Enter the 6-digit code for
              </p>
              <p className="mt-0.5 font-semibold text-primary">{email}</p>
            </div>

            <OtpInput value={otp} onChange={setOtp} disabled={loading} />

            {otpError && (
              <p className="text-center text-xs text-red-400" role="alert">
                {otpError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.replace(/\s/g, "").length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserCheck className="size-4" />
              )}
              {loading ? "Reactivating…" : "Reactivate account"}
            </button>

            <button
              type="button"
              onClick={() => void handleResendCode()}
              disabled={loading || resendRemaining > 0}
              className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary/50 transition hover:text-accent disabled:cursor-not-allowed disabled:text-primary/30"
            >
              {resendRemaining > 0
                ? `Resend code in ${resendRemaining}s`
                : "Resend code"}
            </button>

            <button
              type="button"
              onClick={() => setStep("email")}
              className="flex w-full items-center justify-center gap-1.5 text-sm text-primary/50 transition hover:text-accent"
            >
              <ArrowLeft className="size-3.5" />
              Change email
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <p className="text-lg font-semibold text-primary">Welcome back!</p>
            <p className="text-sm text-primary/55">
              Redirecting to your dashboard…
            </p>
          </div>
        )}

        {step !== "done" && (
          <div className="border-t border-glass pt-4 text-center">
            <Link
              href="/"
              className="text-sm text-primary/50 transition hover:text-accent"
            >
              ← Back to sign in
            </Link>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export default function ReactivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-main text-primary/60">
          Loading…
        </div>
      }
    >
      <ReactivateContent />
    </Suspense>
  );
}
