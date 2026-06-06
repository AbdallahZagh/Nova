"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  UserPlus,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, PasswordInput } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { registerApi, resendOtpApi, verifyOtpApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { bodyToUsername, validateUsername } from "@/lib/username";

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

type Step = "details" | "otp" | "done";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [usernameBody, setUsernameBody] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const stepNum = step === "details" ? 1 : step === "otp" ? 2 : 3;
  const resendRemaining = Math.max(
    0,
    Math.ceil((otpCooldownUntil - now) / 1000),
  );

  useEffect(() => {
    if (!otpCooldownUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [otpCooldownUntil]);

  const requestRegisterOtp = async () => {
    setFormError("");
    setUsernameError("");

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    const username = bodyToUsername(usernameBody);
    const usernameValidation = validateUsername(username);
    if (usernameValidation) {
      setUsernameError(usernameValidation);
      return;
    }

    setLoading(true);
    try {
      const res = await registerApi({
        email,
        password,
        fullName,
        username,
        roleTitle,
      });
      if (res._devOtp) {
        toast({
          variant: "success",
          title: "OTP sent (dev mode)",
          message: `Your code: ${res._devOtp}`,
        });
      } else {
        toast({
          variant: "success",
          title: "Account created",
          message: res.message || "Check your email for the verification code.",
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
          : "Could not create account. Try again.";
      setFormError(msg);
      toast({ variant: "error", title: "Registration failed", message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestRegisterOtp();
  };

  const handleResendOtp = async () => {
    if (resendRemaining > 0) return;
    setOtpError("");
    setLoading(true);
    try {
      const res = await resendOtpApi(email.trim(), "REGISTER");
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
          : "Could not resend verification code. Try again.",
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
      await verifyOtpApi(email.trim(), otp.trim(), "REGISTER");
      setStep("done");
      toast({
        variant: "success",
        title: "Email verified",
        message: "Your account is active. You can sign in now.",
      });
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

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-main px-4 py-12 text-primary">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary/50">
          Get started
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="mt-2 text-sm text-primary/60">
          Join Taskflow and verify your email
        </p>
      </div>

      <GlassCard className="w-full max-w-xl space-y-4">
        {step !== "done" && (
          <div className="flex items-center justify-center gap-3">
            <StepDot n={1} active={step === "details"} done={stepNum > 1} />
            <div
              className={cn(
                "h-px w-10 transition",
                stepNum > 1 ? "bg-emerald-500/40" : "bg-glass",
              )}
            />
            <StepDot n={2} active={step === "otp"} done={false} />
          </div>
        )}

        {step === "details" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="flex justify-between gap-4">

            <div className="flex-1"> 
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Full name
              </label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sarah Johnson"
                required
                autoFocus
                variant="soft"
                className="bg-main/60"
              />
            </div>

            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Username
              </label>
              <div className="flex">
                <span
                  className={cn(
                    "flex items-center rounded-l-xl border border-r-0 border-glass bg-glass-button/60 px-3 text-sm font-medium text-primary/50",
                    usernameError && "border-red-500/40",
                  )}
                  aria-hidden
                  >
                  @
                </span>
                <Input
                  value={usernameBody}
                  onChange={(e) => {
                    setUsernameBody(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    );
                    if (usernameError) setUsernameError("");
                  }}
                  onBlur={() => {
                    const normalized = bodyToUsername(usernameBody);
                    setUsernameBody(
                      normalized ? normalized.slice(1) : "",
                    );
                  }}
                  placeholder="abdallah_zagh"
                  required
                  spellCheck={false}
                  variant="soft"
                  className={cn(
                    "rounded-l-none bg-main/60",
                    usernameError && "border-red-500/40",
                  )}
                  />
              </div>
              {usernameError ? (
                <p className="mt-1.5 text-xs text-red-400" role="alert">
                  {usernameError}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-primary/45">
                  Lowercase letters, numbers, and underscores only.
                </p>
              )}
            </div>
              </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Role / title
              </label>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Senior Frontend Engineer"
                required
                variant="soft"
                className="bg-main/60"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                variant="soft"
                className="bg-main/60"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-primary/80">
                Password
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                autoComplete="new-password"
                variant="soft"
                className="bg-main/60"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-400" role="alert">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

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
              {loading ? "Verifying…" : "Verify email →"}
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
              onClick={() => setStep("details")}
              className="flex w-full items-center justify-center gap-1.5 text-sm text-primary/50 transition hover:text-accent"
            >
              <ArrowLeft className="size-3.5" />
              Back to details
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">
                Account verified!
              </p>
              <p className="mt-1 text-sm text-primary/55">
                You can now sign in with your email and password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-2 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Go to sign in
            </button>
          </div>
        )}

        {step !== "done" && (
          <div className="border-t border-glass pt-4 text-center">
            <p className="text-sm text-primary/50">
              Already have an account?{" "}
              <Link
                href="/"
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
