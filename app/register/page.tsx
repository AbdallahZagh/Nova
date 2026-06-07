"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input, PasswordInput } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { bodyToUsername, validateUsername } from "@/lib/username";

export default function RegisterPage() {
  const { toast } = useToast();

  const [step, setStep] = useState<"details" | "done">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [usernameBody, setUsernameBody] = useState("");
  const [roleTitle, setRoleTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            username,
            role_title: roleTitle.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setFormError(error.message);
        toast({ variant: "error", title: "Registration failed", message: error.message });
        return;
      }

      toast({
        variant: "success",
        title: "Account created",
        message: "Check your email for a confirmation link.",
      });
      setStep("done");
    } catch {
      const msg = "Could not create account. Try again.";
      setFormError(msg);
      toast({ variant: "error", title: "Registration failed", message: msg });
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
          Join Nova and confirm your email
        </p>
      </div>

      <GlassCard className="w-full max-w-xl space-y-4">
        {step === "details" && (
          <>
            <GoogleSignInButton label="Sign up with Google" />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-glass" />
              <span className="text-xs text-primary/45">or</span>
              <div className="h-px flex-1 bg-glass" />
            </div>

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
                      setUsernameBody(normalized ? normalized.slice(1) : "");
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
              {loading ? "Creating account…" : "Create account with email"}
            </button>
          </form>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-primary">
                Check your email!
              </p>
              <p className="mt-1 text-sm text-primary/55">
                We sent a confirmation link to{" "}
                <span className="font-medium text-primary">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
            </div>
            <a
              href="/"
              className="mt-2 w-full rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Go to sign in
            </a>
          </div>
        )}

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
      </GlassCard>
    </div>
  );
}
