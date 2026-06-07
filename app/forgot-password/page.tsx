"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, PasswordInput } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

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

type Step = "email" | "sent" | "password" | "done";

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // When Supabase redirects back after the reset link is clicked,
  // the callback route adds ?step=reset so we know to show the password form.
  const [step, setStep] = useState<Step>(
    searchParams.get("step") === "reset" ? "password" : "email",
  );

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const stepNum = step === "email" ? 1 : step === "sent" ? 1 : step === "password" ? 2 : 3;

  // Listen for the PASSWORD_RECOVERY event from Supabase (fires when the
  // recovery token is active in this tab after the callback redirect).
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStep("password");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Step 1: send reset email ─────────────────────────────────────────────

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const redirectTo =
        `${window.location.origin}/auth/callback?next=/forgot-password%3Fstep%3Dreset`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo },
      );

      if (error) {
        setEmailError(error.message);
        return;
      }

      toast({
        variant: "success",
        title: "Reset link sent",
        message: "Check your email and click the link to reset your password.",
      });
      setStep("sent");
    } catch {
      setEmailError("Could not send reset link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: set new password (user arrived via reset link) ───────────────

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
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPasswordError(error.message);
        return;
      }

      await supabase.auth.signOut();
      setStep("done");
      toast({ variant: "success", title: "Password updated", message: "You can now sign in with your new password." });
    } catch {
      setPasswordError("Could not update password. Try again.");
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
          {step === "password"
            ? "Choose a new password for your account"
            : "We'll send a reset link to your email"}
        </p>
      </div>

      <GlassCard className="w-full max-w-md space-y-6">
        {step !== "done" && step !== "sent" && (
          <div className="flex items-center justify-center gap-3">
            <StepDot n={1} active={step === "email"} done={stepNum > 1} />
            <div className={cn("h-px w-10 transition", stepNum > 1 ? "bg-emerald-500/40" : "bg-glass")} />
            <StepDot n={2} active={step === "password"} done={false} />
          </div>
        )}

        {/* ── Step 1: Email ── */}
        {step === "email" && (
          <form onSubmit={handleSendReset} className="space-y-4">
            <div>
              <p className="mb-4 text-sm text-primary/60">
                Enter your account email and we'll send you a reset link.
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
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        {/* ── Sent confirmation ── */}
        {step === "sent" && (
          <div className="space-y-4 text-center">
            <div className="flex size-16 mx-auto items-center justify-center rounded-2xl bg-accent/15">
              <Mail className="size-8 text-accent" />
            </div>
            <div>
              <p className="font-semibold text-primary">Check your inbox</p>
              <p className="mt-1 text-sm text-primary/55">
                We sent a reset link to{" "}
                <span className="font-medium text-primary">{email}</span>.
                Click it to set a new password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="text-sm text-accent underline-offset-2 hover:underline"
            >
              Use a different email
            </button>
          </div>
        )}

        {/* ── Step 2: New password ── */}
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
              ← Back to sign in
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
