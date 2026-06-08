"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FolderKanban,
  KeyRound,
  ListChecks,
  Loader2,
  Mail,
  RefreshCw,
  RotateCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { clearSession } from "@/app/actions/session";
import { GlassCard } from "@/components/ui/GlassCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input, PasswordInput, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import { useUser } from "@/components/providers/UserProvider";
import {
  forgotPasswordApi,
  resendOtpApi,
  resetPasswordApi,
  verifyOtpApi,
} from "@/lib/api/auth";
import { deactivateMeApi } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  bodyToUsername,
  usernameToBody,
  validateUsername,
} from "@/lib/username";

function formatProfileDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function maskProfileEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

// ── Section: Edit Profile ─────────────────────────────────────────────────────

function EditProfileSection() {
  const { profile, updateProfile } = useUser();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    role: "",
    email: "",
    usernameBody: "",
    bio: "",
  });
  const [usernameError, setUsernameError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name,
        role: profile.role,
        email: profile.email,
        usernameBody: usernameToBody(profile.username),
        bio: profile.bio,
      });
      setUsernameError("");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    const username = bodyToUsername(form.usernameBody);
    const usernameValidation = validateUsername(username);
    if (usernameValidation) {
      setUsernameError(usernameValidation);
      return;
    }
    setUsernameError("");
    setSaving(true);
    try {
      await updateProfile({
        name: form.name,
        role: form.role,
        username,
        bio: form.bio,
      });
      toast({
        variant: "success",
        title: "Profile updated",
        message: "Your changes have been saved.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Update failed",
        message:
          err instanceof ApiError
            ? err.message
            : "Could not save profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <GlassCard className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <User className="size-4" />
        </div>
        <h2 className="text-base font-semibold text-primary">Edit Profile</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60">
              Full Name
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60">
              Role / Title
            </label>
            <Input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Product Lead"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60">
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
                value={form.usernameBody}
                onChange={(e) => {
                  const body = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "");
                  setForm((f) => ({ ...f, usernameBody: body }));
                  if (usernameError) setUsernameError("");
                }}
                onBlur={() => {
                  const normalized = bodyToUsername(form.usernameBody);
                  setForm((f) => ({
                    ...f,
                    usernameBody: normalized ? normalized.slice(1) : "",
                  }));
                }}
                placeholder="abdallah_zagh"
                autoComplete="username"
                spellCheck={false}
                className={cn(
                  "rounded-l-none",
                  usernameError && "border-red-500/40 focus:border-red-500/50",
                )}
                aria-invalid={Boolean(usernameError)}
                aria-describedby={
                  usernameError ? "username-error" : "username-hint"
                }
              />
            </div>
            {usernameError ? (
              <p
                id="username-error"
                className="mt-1 text-[11px] text-red-400"
                role="alert"
              >
                {usernameError}
              </p>
            ) : (
              <p id="username-hint" className="mt-1 text-[11px] text-primary/45">
                Lowercase letters, numbers, and underscores only. Saved as @
                {form.usernameBody || "your_handle"}.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60">
              Email Address
            </label>
            <Input
              type="email"
              value={form.email}
              readOnly
              disabled
              placeholder="you@company.com"
              className="opacity-70"
            />
            <p className="mt-1 text-[11px] text-primary/45">
              Email cannot be changed here.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-primary/60">
            Bio
          </label>
          <Textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
            placeholder="A short bio about yourself..."
            className="resize-none"
          />
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="size-4" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Section: Change Password ──────────────────────────────────────────────────

type PasswordStep = "idle" | "sent" | "verified" | "done";

function ProfilePasswordRail({ step }: { step: PasswordStep }) {
  const activeIndex =
    step === "idle" ? 0 : step === "sent" ? 1 : step === "verified" ? 2 : 3;
  const items = [
    { label: "Send", icon: Mail },
    { label: "Verify", icon: ShieldCheck },
    { label: "Reset", icon: KeyRound },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ label, icon: Icon }, index) => {
        const active = activeIndex === index;
        const done = activeIndex > index;

        return (
          <div
            key={label}
            className={cn(
              "rounded-xl border px-3 py-2 transition",
              done
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : active
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-glass bg-glass-button/40 text-primary/40",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-main/45">
                {done ? <CheckCircle2 className="size-3.5" /> : <Icon className="size-3.5" />}
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileOtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  return (
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          aria-label={`OTP digit ${index + 1}`}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, 6);
            if (!pasted) return;
            onChange(pasted);
            inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
          }}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(-1);
            const chars = value.padEnd(6, " ").split("");
            chars[index] = next || " ";
            onChange(chars.join("").replace(/\s/g, "").slice(0, 6));
            if (next && index < 5) inputRefs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) {
              inputRefs.current[index - 1]?.focus();
            }
          }}
          className="size-12 rounded-xl border border-glass bg-main/60 text-center text-lg font-semibold text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50 sm:size-14"
        />
      ))}
    </div>
  );
}

function ChangePasswordSection() {
  const { profile } = useUser();
  const { toast } = useToast();

  const [step, setStep] = useState<PasswordStep>("idle");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpError, setOtpError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const maskedEmail = profile?.email ? maskProfileEmail(profile.email) : "";
  const passwordReady = newPassword.length >= 8 && newPassword === confirmPassword;

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestOtp = async () => {
    if (!profile?.email) return;
    setOtpError("");
    setPasswordError("");
    setLoading(true);
    try {
      const response = await forgotPasswordApi(profile.email);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setCooldown(30);
      setStep("sent");
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
      setOtpError(message);
      toast({ variant: "error", title: "OTP failed", message });
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!profile?.email || cooldown || loading) return;
    setOtpError("");
    setLoading(true);
    try {
      const response = await resendOtpApi(profile.email, "FORGOT_PASSWORD");
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

  const verifyOtp = async () => {
    if (!profile?.email) return;
    if (otp.length !== 6) {
      setOtpError("Enter the 6-digit OTP.");
      return;
    }
    setOtpError("");
    setLoading(true);
    try {
      await verifyOtpApi(profile.email, otp, "FORGOT_PASSWORD");
      setStep("verified");
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

  const savePassword = async () => {
    if (!profile?.email) return;
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordError("");
    setLoading(true);
    try {
      await resetPasswordApi(profile.email, otp, newPassword);
      setStep("done");
      toast({ variant: "success", title: "Password updated", message: "Your password has been changed successfully." });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not update password. Try again.";
      setPasswordError(message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("idle");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpError("");
    setPasswordError("");
    setCooldown(0);
  };

  return (
    <GlassCard className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <KeyRound className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-primary">
            Password &amp; Security
          </h2>
          <p className="text-xs text-primary/50">
            Reset your password with an email OTP.
          </p>
        </div>
      </div>

      {step !== "done" ? (
        <div className="mb-5">
          <ProfilePasswordRail step={step} />
        </div>
      ) : null}

      {step === "done" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <CheckCircle2 className="size-7 text-emerald-400" />
          </div>
          <p className="font-semibold text-primary">Password Updated</p>
          <p className="text-sm text-primary/55">
            Your password has been changed successfully.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
          >
            <RefreshCw className="size-3.5" /> Change again
          </button>
        </div>
      ) : step === "idle" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-glass bg-glass-button/40 px-4 py-3">
            <p className="text-sm font-semibold text-primary">
              Verify this account first
            </p>
            <p className="mt-1 text-sm text-primary/55">
              We&apos;ll send a reset code to{" "}
              <span className="font-medium text-primary">{maskedEmail}</span>.
            </p>
          </div>
          {otpError && <p className="text-xs text-red-400">{otpError}</p>}
          <button
            type="button"
            onClick={requestOtp}
            disabled={loading || !profile?.email}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            {loading ? "Sending..." : "Send reset OTP"}
          </button>
        </div>
      ) : step === "sent" ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              Enter your 6-digit code
            </p>
            <p className="mt-1 text-sm text-primary/55">
              Sent to <span className="font-medium text-primary">{maskedEmail}</span>
            </p>
          </div>
          <ProfileOtpInput
            value={otp}
            onChange={(value) => {
              setOtp(value);
              if (otpError) setOtpError("");
            }}
            disabled={loading}
          />
          {otpError && <p className="text-xs text-red-400">{otpError}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={loading || cooldown > 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-glass bg-glass-button px-5 py-2.5 text-sm font-semibold text-primary transition hover:text-accent disabled:opacity-50"
            >
              <RotateCw className="size-4" />
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              Choose your new password
            </p>
            <p className="mt-1 text-sm text-primary/55">
              This will reset the password for {maskedEmail}.
            </p>
          </div>
          <PasswordInput
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (passwordError) setPasswordError("");
            }}
            placeholder="New password (min 8 characters)"
          />
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (passwordError) setPasswordError("");
            }}
            placeholder="Confirm new password"
          />
          {passwordError && (
            <p className="text-xs text-red-400">{passwordError}</p>
          )}
          <div className="rounded-xl border border-glass bg-glass-button/40 px-3 py-2 text-xs text-primary/50">
            {newPassword.length < 8
              ? "Use at least 8 characters."
              : newPassword !== confirmPassword
                ? "Passwords must match."
                : "Password is ready to save."}
          </div>
          <button
            type="button"
            onClick={savePassword}
            disabled={loading || !passwordReady}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Update Password
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ProfileActivitySection() {
  const { profile } = useUser();
  if (!profile) return null;

  return (
    <GlassCard title="Recent Activity">
      <ActivityHeatmap activity={profile.activity} />
    </GlassCard>
  );
}

function ProfileProjectsSection() {
  const { profile } = useUser();
  if (!profile) return null;

  return (
    <GlassCard className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <FolderKanban className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-primary">Projects</h2>
          <p className="text-xs text-primary/50">
            Your project membership and assigned work
          </p>
        </div>
      </div>

      {profile.projects.length === 0 ? (
        <p className="rounded-2xl border border-glass bg-glass-button/40 px-4 py-6 text-center text-sm text-primary/45">
          No projects found.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {profile.projects.map((project) => {
            const completion =
              project.userTasksCount > 0
                ? Math.round(
                    (project.completedUserTasksCount / project.userTasksCount) *
                      100,
                  )
                : 0;

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-2xl border border-glass bg-glass-button/45 p-4 transition hover:border-accent/45 hover:bg-glass-button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-primary group-hover:text-accent">
                      {project.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-primary/55">
                      {project.description || "No description"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                      project.role === "OWNER"
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : "border-glass bg-main/40 text-primary/55",
                    )}
                  >
                    {project.role}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-primary/50">
                  <span className="rounded-md border border-glass bg-main/35 px-2 py-1">
                    {project.status}
                  </span>
                  <span>Updated {formatProfileDate(project.updatedAt)}</span>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-primary/55">
                      <ListChecks className="size-3.5" />
                      My tasks
                    </span>
                    <span className="font-semibold text-primary">
                      {project.completedUserTasksCount}/{project.userTasksCount}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-main/50">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-glass pt-3 text-xs text-primary/45">
                  <span>
                    {project.totalTasksCount} total task
                    {project.totalTasksCount === 1 ? "" : "s"}
                  </span>
                  <span>Created {formatProfileDate(project.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { profile, initials, loading, refreshProfile } = useUser();

  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);

  async function handleDeleteAccount() {
    try {
      await deactivateMeApi();
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not deactivate account",
        message:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      });
      return;
    }
    await clearSession();
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm text-primary/60">Could not load your profile.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* ── Back button + title ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-9 items-center justify-center rounded-xl border border-glass bg-glass-button text-primary/60 transition hover:text-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Profile Settings
          </h1>
          <p className="text-sm text-primary/50">
            Manage your account and preferences
          </p>
        </div>
      </div>

      {/* ── Profile overview card ── */}
      <GlassCard className="p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="flex size-24 items-center justify-center rounded-2xl bg-linear-135 from-accent to-accent/60 text-3xl font-bold text-white shadow-lg shadow-accent/25">
              {initials}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full border-2 border-sidebar bg-glass-button text-primary/50 transition hover:text-accent cursor-pointer">
              <Camera className="size-3.5" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-primary">{profile.name}</h2>
            {profile.username ? (
              <p className="mt-0.5 text-sm font-medium text-accent">
                {profile.username}
              </p>
            ) : null}
            <p className="mt-0.5 text-sm text-primary/70">{profile.role}</p>
            <p className="mt-0.5 text-sm text-primary/55">{profile.email}</p>
            {profile.bio && (
              <p className="mt-2 text-sm leading-relaxed text-primary/65">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex shrink-0 gap-4 sm:flex-col sm:gap-3 sm:text-right">
            <div className="rounded-xl border border-glass bg-glass-button/50 px-4 py-2.5 text-center">
              <p className="text-xl font-bold text-primary">{profile.projectCount}</p>
              <p className="text-[11px] text-primary/50">Projects</p>
            </div>
            <div className="rounded-xl border border-glass bg-glass-button/50 px-4 py-2.5 text-center">
              <p className="text-xl font-bold text-primary">{profile.taskCount}</p>
              <p className="text-[11px] text-primary/50">Tasks</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Edit profile ── */}
      <EditProfileSection />

      {/* ── Change password ── */}
      <ChangePasswordSection />

      <ProfileActivitySection />

      <ProfileProjectsSection />

      {/* ── Danger zone ── */}
      <GlassCard className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-red-500/15 text-red-400 light:text-red-600">
            <ShieldAlert className="size-4" />
          </div>
          <h2 className="text-base font-semibold text-primary">Danger Zone</h2>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">
                Deactivate Account
              </p>
              <p className="mt-0.5 text-xs text-primary/55">
                Archive your account and sign out. Projects and tasks are kept.
                Reactivate later with your email and a one-time code.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 light:text-red-600 transition hover:bg-red-500/10"
            >
              <Trash2 className="size-4" />
              Deactivate
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Delete confirm modal ── */}
      <DeleteConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteAccount}
        title="Deactivate your account?"
        message="Your account will be archived and you will be signed out. Your projects and tasks stay saved. You can reactivate anytime from the sign-in page."
        confirmLabel="Deactivate my account"
      />
    </div>
  );
}
