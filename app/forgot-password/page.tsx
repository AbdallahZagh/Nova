"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, PasswordInput } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import {
  forgotPasswordApi,
  resendOtpApi,
  resetPasswordApi,
  verifyOtpApi,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

// ── OTP input ─────────────────────────────────────────────────────────────────

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

// ── Step indicator ─────────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

type Step = "email" | "otp" | "password" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const stepNum = step === "email" ? 1 : step === "otp" ? 2 : step === "password" ? 3 : 4;
  const resendRemaining = Math.max(
    0,
    Math.ceil((otpCooldownUntil - now) / 1000),
  );

  useEffect(() => {
    if (!otpCooldownUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [otpCooldownUntil]);

  // ── Step 1: request OTP ──────────────────────────────────────────────────────

  const requestOtp = async () => {
    setEmailError("");
    setLoading(true);
    try {
      const res = await forgotPasswordApi(email.trim());
      if (res._devOtp) {
        toast({
          variant: "success",
          title: "OTP sent (dev mode)",
          message: `Your code: ${res._devOtp}`,
        });
      } else {
        toast({
          variant: "success",
          title: "Email sent",
          message: "Check your inbox for the 6-digit code.",
        });
      }
      const nextNow = Date.now();
      setOtpCooldownUntil(nextNow + 30_000);
      setNow(nextNow);
      setStep("otp");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not send reset code. Try again.";
      setEmailError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtp();
  };

  const handleResendOtp = async () => {
    if (resendRemaining > 0) return;
    setEmailError("");
    setOtpError("");
    setLoading(true);
    try {
      const res = await resendOtpApi(email.trim(), "FORGOT_PASSWORD");
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
          : "Could not resend reset code. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ───────────────────────────────────────────────────────

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    if (otp.replace(/\s/g, "").length < 6) {
      setOtpError("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtpApi(email.trim(), otp.trim(), "FORGOT_PASSWORD");
      setStep("password");
    } catch (err) {
      setOtpError(
        err instanceof ApiError
          ? err.message
          : "Invalid or expired code. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: set new password ─────────────────────────────────────────────────

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPasswordApi(email.trim(), otp.trim(), newPassword);
      setStep("done");
    } catch (err) {
      setPasswordError(
        err instanceof ApiError
          ? err.message
          : "Could not reset password. Try again.",
      );
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
          Reset password
        </h1>
        <p className="mt-2 text-sm text-primary/60">
          We'll send a one-time code to your email
        </p>
      </div>

      <GlassCard className="w-full max-w-md space-y-6">
        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-3">
            <StepDot n={1} active={step === "email"} done={stepNum > 1} />
            <div
              className={cn(
                "h-px w-10 transition",
                stepNum > 1 ? "bg-emerald-500/40" : "bg-glass",
              )}
            />
            <StepDot n={2} active={step === "otp"} done={stepNum > 2} />
            <div
              className={cn(
                "h-px w-10 transition",
                stepNum > 2 ? "bg-emerald-500/40" : "bg-glass",
              )}
            />
            <StepDot n={3} active={step === "password"} done={false} />
          </div>
        )}

        {/* ── Step 1: Email ── */}
        {step === "email" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <p className="mb-4 text-sm text-primary/60">
                Enter the email address for your account and we'll send you a
                reset code.
              </p>
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
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="text-center">
              <p className="text-sm text-primary/60">
                Enter the 6-digit code sent to
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
              ) : null}
              {loading ? "Verifying…" : "Verify code →"}
            </button>

            <button
              type="button"
              onClick={() => void handleResendOtp()}
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

        {/* ── Step 3: New password ── */}
        {step === "password" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <p className="mb-4 text-sm text-primary/60">
                Choose a new password for your account.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-primary/80">
                    New password
                  </label>
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    autoFocus
                    variant="soft"
                    className="bg-main/60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-primary/80">
                    Confirm password
                  </label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    variant="soft"
                    className="bg-main/60"
                  />
                </div>
              </div>
              {passwordError && (
                <p className="mt-1.5 text-xs text-red-400" role="alert">
                  {passwordError}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">
                Password updated!
              </p>
              <p className="mt-1 text-sm text-primary/55">
                You can now sign in with your new password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-2 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* Back to sign in link */}
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
