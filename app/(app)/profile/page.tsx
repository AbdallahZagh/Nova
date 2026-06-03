"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import { clearSession } from "@/app/actions/session";
import { GlassCard } from "@/components/ui/GlassCard";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Input, PasswordInput, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import { useUser } from "@/components/providers/UserProvider";
import {
  forgotPasswordApi,
  resetPasswordApi,
  verifyOtpApi,
} from "@/lib/api/auth";
import { deactivateMeApi } from "@/lib/api/users";
import { clearAccessToken, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  bodyToUsername,
  usernameToBody,
  validateUsername,
} from "@/lib/username";

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
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  const handleKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  };

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

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      refs[Math.min(pasted.length, 5)].current?.focus();
    }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2">
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
            "size-11 rounded-xl border border-glass bg-glass-button text-center text-lg font-bold text-primary outline-none transition",
            "focus:border-accent focus:ring-2 focus:ring-accent/20",
            "disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
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

function ChangePasswordSection() {
  const { profile } = useUser();
  const { toast } = useToast();

  const [step, setStep] = useState<PasswordStep>("idle");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = profile?.email ?? "";

  const sendOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await forgotPasswordApi(email);
      setOtp("");
      setOtpError("");
      setStep("sent");
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
          message: "Check your inbox for the 6-digit code.",
        });
      }
    } catch (err) {
      toast({
        variant: "error",
        title: "Failed to send code",
        message:
          err instanceof ApiError ? err.message : "Could not send OTP.",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.replace(/\s/g, "").length < 6) {
      setOtpError("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtpApi(email, otp.trim(), "FORGOT_PASSWORD");
      setOtpError("");
      setStep("verified");
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

  const savePassword = async () => {
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
      await resetPasswordApi(email, otp.trim(), newPassword);
      setStep("done");
      toast({
        variant: "success",
        title: "Password updated",
        message: "Your password has been changed successfully.",
      });
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Could not update password.",
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("idle");
    setOtp("");
    setOtpError("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  };

  return (
    <GlassCard className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <KeyRound className="size-4" />
        </div>
        <h2 className="text-base font-semibold text-primary">
          Password &amp; Security
        </h2>
      </div>

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
      ) : (
        <div className="space-y-5">
          {/* Step 1 — Request OTP */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition",
              step === "idle"
                ? "border-glass bg-glass-button/30"
                : "border-emerald-500/30 bg-emerald-500/5",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                    step !== "idle"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-accent/20 text-accent",
                  )}
                >
                  {step !== "idle" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    "1"
                  )}
                </div>
                <span className="text-sm font-medium text-primary">
                  Send verification code
                </span>
              </div>
              {step === "idle" ? (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                  Send OTP
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading}
                  className="text-xs text-accent underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Resend
                </button>
              )}
            </div>

            {step !== "idle" && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2">
                <Mail className="size-3.5 shrink-0 text-accent" />
                <p className="text-xs text-primary/70">
                  Code sent to{" "}
                  <span className="font-semibold text-primary">{email}</span>
                  {" — "}check the toast for the dev OTP.
                </p>
              </div>
            )}
          </div>

          {/* Step 2 — Enter OTP */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition",
              step === "idle"
                ? "border-glass/50 opacity-40 pointer-events-none"
                : step === "verified"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-glass bg-glass-button/30",
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                  step === "verified"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-accent/20 text-accent",
                )}
              >
                {step === "verified" ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  "2"
                )}
              </div>
              <span className="text-sm font-medium text-primary">
                Enter the 6-digit code
              </span>
            </div>

            <div className="space-y-3">
              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={step === "idle" || step === "verified" || loading}
              />
              {otpError && (
                <p className="text-xs text-red-400">{otpError}</p>
              )}
              {step === "sent" && (
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={loading || otp.replace(/\s/g, "").length < 6}
                  className="flex items-center gap-1.5 rounded-lg border border-glass bg-glass-button px-4 py-1.5 text-xs font-semibold text-primary transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
                >
                  {loading && <Loader2 className="size-3.5 animate-spin" />}
                  Verify Code →
                </button>
              )}
            </div>
          </div>

          {/* Step 3 — New Password */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition",
              step !== "verified"
                ? "pointer-events-none border-glass/50 opacity-40"
                : "border-glass bg-glass-button/30",
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                3
              </div>
              <span className="text-sm font-medium text-primary">
                Set new password
              </span>
            </div>

            <div className="space-y-3">
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
              />
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              {passwordError && (
                <p className="text-xs text-red-400">{passwordError}</p>
              )}
              <button
                type="button"
                onClick={savePassword}
                disabled={loading || !newPassword || !confirmPassword}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
    clearAccessToken();
    await clearSession();
    toast({
      variant: "success",
      title: "Account deactivated",
      message:
        "Your account is archived. You can reactivate it anytime with your email.",
    });
    router.push("/reactivate");
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
