"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
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

type Step = "email" | "otp" | "password" | "done";

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
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

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node;
          }}
          value={digit}
          inputMode="numeric"
          maxLength={1}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, 6);
            if (pasted) onChange(pasted);
          }}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(-1);
            const chars = value.padEnd(6, " ").split("");
            chars[index] = next || " ";
            onChange(chars.join("").replace(/\s/g, "").slice(0, 6));
            if (next && index < 5) inputRefs.current[index + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digit && index > 0) {
              inputRefs.current[index - 1]?.focus();
            }
          }}
          className="size-11 rounded-xl border border-glass bg-main/60 text-center text-lg font-semibold text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      ))}
    </div>
  );
}

function ForgotPasswordContent() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const stepNum = step === "email" ? 1 : step === "otp" ? 2 : step === "password" ? 3 : 4;

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setLoading(true);

    try {
      const response = await forgotPasswordApi(email.trim());
      setOtp("");
      setCooldown(30);
      setStep("otp");
      toast({
        variant: "success",
        title: "OTP sent",
        message: response._devOtp
          ? `Dev OTP: ${response._devOtp}`
          : "Check your email for the verification code.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not send OTP. Try again.";
      setEmailError(message);
      toast({ variant: "error", title: "Reset failed", message });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown || loading) return;
    setOtpError("");
    setLoading(true);

    try {
      const response = await resendOtpApi(email.trim(), "FORGOT_PASSWORD");
      setOtp("");
      setCooldown(30);
      toast({
        variant: "success",
        title: "OTP resent",
        message: response._devOtp
          ? `Dev OTP: ${response._devOtp}`
          : "A fresh code was sent to your email.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not resend OTP. Try again.";
      setOtpError(message);
      toast({ variant: "error", title: "Resend failed", message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");

    if (otp.length !== 6) {
      setOtpError("Enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    try {
      await verifyOtpApi(email.trim(), otp, "FORGOT_PASSWORD");
      setStep("password");
      toast({ variant: "success", title: "OTP verified" });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not verify OTP. Try again.";
      setOtpError(message);
      toast({ variant: "error", title: "Verification failed", message });
    } finally {
      setLoading(false);
    }
  };

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
      await resetPasswordApi(email.trim(), otp, newPassword);
      setStep("done");
      toast({
        variant: "success",
        title: "Password updated",
        message: "You can now sign in with your new password.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not update password. Try again.";
      setPasswordError(message);
      toast({ variant: "error", title: "Password reset failed", message });
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
          Verify your email and choose a new password
        </p>
      </div>

      <GlassCard className="w-full max-w-md space-y-6">
        {step !== "done" && (
          <div className="flex items-center justify-center gap-3">
            <StepDot n={1} active={step === "email"} done={stepNum > 1} />
            <div className={cn("h-px w-10 transition", stepNum > 1 ? "bg-emerald-500/40" : "bg-glass")} />
            <StepDot n={2} active={step === "otp"} done={stepNum > 2} />
            <div className={cn("h-px w-10 transition", stepNum > 2 ? "bg-emerald-500/40" : "bg-glass")} />
            <StepDot n={3} active={step === "password"} done={false} />
          </div>
        )}

        {step === "email" && (
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <p className="mb-4 text-sm text-primary/60">
                Enter your account email and we will send you an OTP.
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
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="text-center">
              <p className="font-semibold text-primary">Enter verification code</p>
              <p className="mt-1 text-sm text-primary/55">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-primary">{email}</span>.
              </p>
            </div>

            <OtpInput value={otp} onChange={setOtp} />

            {otpError && (
              <p className="text-center text-sm text-red-400" role="alert">
                {otpError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-primary/50 transition hover:text-accent"
              >
                Change email
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || cooldown > 0}
                className="text-accent underline-offset-2 hover:underline disabled:text-primary/35 disabled:no-underline"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </button>
            </div>
          </form>
        )}

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
              {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {loading ? "Saving..." : "Set new password"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">Password updated!</p>
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

        {step !== "done" && (
          <div className="border-t border-glass pt-4 text-center">
            <Link href="/" className="text-sm text-primary/50 transition hover:text-accent">
              Back to sign in
            </Link>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  );
}
