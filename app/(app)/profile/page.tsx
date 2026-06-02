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
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import { useUser } from "@/components/providers/UserProvider";
import { logoutApi } from "@/lib/api/auth";
import { clearAccessToken, ApiError } from "@/lib/api/client";
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
    bio: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name,
        role: profile.role,
        email: profile.email,
        bio: profile.bio,
      });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile({
        name: form.name,
        role: form.role,
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
  const [step, setStep] = useState<PasswordStep>("idle");
  const [demoCode, setDemoCode] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setDemoCode(code);
    setOtp("");
    setOtpError(false);
    setStep("sent");
  };

  const verifyOtp = () => {
    if (otp.trim() === demoCode) {
      setOtpError(false);
      setStep("verified");
    } else {
      setOtpError(true);
    }
  };

  const savePassword = () => {
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
    setTimeout(() => {
      setLoading(false);
      setStep("done");
    }, 1000);
  };

  const reset = () => {
    setStep("idle");
    setDemoCode("");
    setOtp("");
    setOtpError(false);
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
                  {step !== "idle" ? <CheckCircle2 className="size-3.5" /> : "1"}
                </div>
                <span className="text-sm font-medium text-primary">
                  Send verification code
                </span>
              </div>
              {step === "idle" ? (
                <button
                  type="button"
                  onClick={sendOtp}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <Mail className="size-3.5" /> Send OTP
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  className="text-xs text-accent underline-offset-2 hover:underline"
                >
                  Resend
                </button>
              )}
            </div>

            {step !== "idle" && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2">
                <Mail className="size-3.5 shrink-0 text-accent" />
                <p className="text-xs text-primary/70">
                  Demo mode — your code:{" "}
                  <span className="font-bold tracking-widest text-accent">
                    {demoCode}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Step 2 — Enter OTP */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition",
              step === "idle"
                ? "border-glass/50 opacity-40"
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
                disabled={step === "idle" || step === "verified"}
              />
              {otpError && (
                <p className="text-xs text-red-400">
                  Incorrect code. Please try again.
                </p>
              )}
              {step === "sent" && (
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otp.replace(/\s/g, "").length < 6}
                  className="rounded-lg border border-glass bg-glass-button px-4 py-1.5 text-xs font-semibold text-primary transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
                >
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
                ? "border-glass/50 opacity-40 pointer-events-none"
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
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
              />
              <Input
                type="password"
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
      await logoutApi();
    } catch {
      /* still clear local session */
    }
    clearAccessToken();
    toast({
      variant: "success",
      title: "Account session ended",
      message: "You have been signed out.",
    });
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
            <p className="mt-0.5 text-sm text-accent">{profile.role}</p>
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
                Delete Account
              </p>
              <p className="mt-0.5 text-xs text-primary/55">
                Permanently remove your account and all associated data. This
                action cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 light:text-red-600 transition hover:bg-red-500/10"
            >
              <Trash2 className="size-4" />
              Delete Account
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Delete confirm modal ── */}
      <DeleteConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteAccount}
        title="Delete your account?"
        message="All your data will be permanently removed. This action cannot be undone."
        confirmLabel="Yes, delete my account"
      />
    </div>
  );
}
