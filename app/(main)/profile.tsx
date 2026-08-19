import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  deactivateMeApi,
  forgotPasswordApi,
  getMeApi,
  logoutApi,
  resendOtpApi,
  resetPasswordApi,
  updateMeApi,
  uploadAvatarApi,
  deleteAvatarApi,
  verifyOtpApi,
} from "@/api/auth";
import type { ApiUser, ApiUserProject } from "@/api/types";
import { ActionSheet } from "@/components/ActionSheet";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { FormField } from "@/components/FormField";
import { OtpInput } from "@/components/OtpInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ReportProblemModal } from "@/components/ReportProblemModal";
import { PageSkeleton } from "@/components/Skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type AppearanceMode,
  useAppearanceStore,
} from "@/store/useAppearanceStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";
import { validatePassword } from "@/utils/validation";

const appearanceOptions: { label: string; value: AppearanceMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const projectCountKeys = [
  "projectCount",
  "projectsCount",
  "totalProjects",
  "project_count",
  "projects_count",
  "total_projects",
] as const;

const taskCountKeys = [
  "taskCount",
  "tasksCount",
  "totalTasks",
  "task_count",
  "tasks_count",
  "total_tasks",
] as const;

type PasswordStep = "idle" | "sent" | "verified";

function pickNumber(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return 0;
}

function extractCounts(user?: ApiUser | null) {
  if (!user) return { projectCount: 0, taskCount: 0 };
  const root = user as Record<string, unknown>;
  const meta =
    typeof root._meta === "object" && root._meta !== null
      ? (root._meta as Record<string, unknown>)
      : null;
  const stats =
    typeof root.stats === "object" && root.stats !== null
      ? (root.stats as Record<string, unknown>)
      : null;

  return {
    projectCount:
      pickNumber(root, projectCountKeys) ||
      (meta ? pickNumber(meta, projectCountKeys) : 0) ||
      (stats ? pickNumber(stats, projectCountKeys) : 0),
    taskCount:
      pickNumber(root, taskCountKeys) ||
      (meta ? pickNumber(meta, taskCountKeys) : 0) ||
      (stats ? pickNumber(stats, taskCountKeys) : 0),
  };
}

function usernameBody(username?: string | null) {
  return (username ?? "").replace(/^@/, "");
}

function updateCompletion(project: ApiUserProject) {
  const assigned = project.userTasksCount ?? 0;
  if (!assigned) return 0;
  return Math.round(((project.completedUserTasksCount ?? 0) / assigned) * 100);
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <View className="mb-4 flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
        <Ionicons name={icon} size={18} color={palette.accent} />
      </View>
      <View className="flex-1">
        <Text className="text-[16px] font-black text-primary dark:text-dark-primary">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ChangePasswordModal({
  visible,
  email,
  onClose,
}: {
  visible: boolean;
  email: string;
  onClose: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [step, setStep] = useState<PasswordStep>("idle");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!visible) return;
    setStep("idle");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setCooldown(0);
  }, [visible]);

  const sendOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const response = await forgotPasswordApi(email);
      setStep("sent");
      setOtp("");
      setCooldown(30);
      showSnackbar({
        variant: "success",
        title: "OTP sent",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : "Check your email for the reset code.",
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "OTP failed",
        message: getApiErrorMessage(error, "Could not send OTP. Try again."),
      });
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!email || cooldown > 0) return;
    setLoading(true);
    try {
      const response = await resendOtpApi(email, "FORGOT_PASSWORD");
      setOtp("");
      setCooldown(30);
      showSnackbar({
        variant: "success",
        title: "OTP resent",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : "A fresh code was sent to your email.",
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Resend failed",
        message: getApiErrorMessage(error, "Could not resend OTP. Try again."),
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      showSnackbar({
        variant: "error",
        title: "Incomplete OTP",
        message: "Enter the complete 6-digit code.",
      });
      return;
    }
    setLoading(true);
    try {
      await verifyOtpApi(email, otp, "FORGOT_PASSWORD");
      setStep("verified");
      showSnackbar({ variant: "success", title: "OTP verified" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Verification failed",
        message: getApiErrorMessage(error, "Could not verify OTP."),
      });
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async () => {
    const validation = validatePassword(newPassword);
    if (validation) {
      showSnackbar({ variant: "error", title: "Invalid password", message: validation });
      return;
    }
    if (newPassword !== confirmPassword) {
      showSnackbar({
        variant: "error",
        title: "Passwords do not match",
        message: "Confirm password must match the new password.",
      });
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi(email, otp, newPassword);
      showSnackbar({
        variant: "success",
        title: "Password updated",
        message: "Your password has been changed successfully.",
      });
      onClose();
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Password update failed",
        message: getApiErrorMessage(error, "Could not update password."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center bg-black/55 px-5"
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="mb-5 flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
              <Ionicons name="key-outline" size={22} color={palette.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-[19px] font-black text-primary dark:text-dark-primary">
                Change Password
              </Text>
              <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                Reset your password with an email OTP sent to {email}.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close change password"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-glass-card active:opacity-75 dark:bg-dark-glass-card"
            >
              <Ionicons name="close-outline" size={20} color={palette.muted} />
            </Pressable>
          </View>

          {step === "idle" ? (
            <View className="gap-4">
              <Text className="rounded-nova border border-glass bg-glass-card p-3 text-sm leading-5 text-muted dark:border-dark-glass dark:bg-dark-glass-card dark:text-dark-muted">
                We will send a six-digit code to your account email before you
                can set a new password.
              </Text>
              <PrimaryButton label="Send OTP" loading={loading} onPress={sendOtp} />
            </View>
          ) : step === "sent" ? (
            <View className="gap-4">
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              <PrimaryButton
                label="Verify OTP"
                loading={loading}
                disabled={otp.length !== 6}
                onPress={verifyOtp}
              />
              <Pressable
                accessibilityRole="button"
                disabled={loading || cooldown > 0}
                onPress={() => void resendOtp()}
                className="items-center py-1 disabled:opacity-50"
              >
                <Text className="text-sm font-extrabold text-accent dark:text-dark-accent">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-4">
              <FormField
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                password
              />
              <FormField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat new password"
                password
              />
              <PrimaryButton
                label="Update Password"
                loading={loading}
                onPress={savePassword}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const storedUser = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const mode = useAppearanceStore((state) => state.mode);
  const setMode = useAppearanceStore((state) => state.setMode);
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  const [profile, setProfile] = useState<ApiUser | null>(storedUser);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeactivatePopup, setShowDeactivatePopup] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAvatarSheet, setShowAvatarSheet] = useState(false);
  const [showAvatarSourceSheet, setShowAvatarSourceSheet] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [form, setForm] = useState({
    fullName: storedUser?.fullName ?? "",
    roleTitle: storedUser?.roleTitle ?? "",
    username: usernameBody(storedUser?.username),
    bio: storedUser?.bio ?? "",
  });

  const counts = extractCounts(profile);
  const isDemo = Boolean(profile?.isDemo ?? storedUser?.isDemo);
  const projects = profile?.projects ?? [];

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getMeApi();
      setProfile(next);
      await setUser(next);
      setForm({
        fullName: next.fullName ?? "",
        roleTitle: next.roleTitle ?? "",
        username: usernameBody(next.username),
        bio: next.bio ?? "",
      });
    } catch (requestError) {
      const message = getApiErrorMessage(
        requestError,
        "Could not load your profile.",
      );
      setError(message);
      showSnackbar({
        variant: "error",
        title: "Profile failed",
        message,
      });
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [setUser, showSnackbar]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    if (!form.fullName.trim()) {
      showSnackbar({
        variant: "error",
        title: "Full name required",
        message: "Full name is required.",
      });
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await updateMeApi({
        fullName: form.fullName,
        name: form.fullName,
        username: form.username,
        roleTitle: form.roleTitle,
        bio: form.bio,
      });
      setProfile(next);
      await setUser(next);
      showSnackbar({
        variant: "success",
        title: "Profile updated",
      });
    } catch (requestError) {
      const message = getApiErrorMessage(
        requestError,
        "Could not update profile.",
      );
      setError(message);
      showSnackbar({
        variant: "error",
        title: "Update failed",
        message,
      });
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async (source: "camera" | "library") => {
    setShowAvatarSourceSheet(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showSnackbar({
        variant: "error",
        title: "Permission needed",
        message:
          source === "camera"
            ? "Allow camera access to take a profile photo."
            : "Allow photo access to choose a profile picture.",
      });
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : mime.includes("gif")
          ? "gif"
          : "jpg";

    setUploadingAvatar(true);
    try {
      const next = await uploadAvatarApi({
        uri: asset.uri,
        name: asset.fileName ?? `avatar.${ext}`,
        type: mime,
      });
      setProfile(next);
      await setUser(next);
      showSnackbar({
        variant: "success",
        title: "Photo updated",
        message: "Your profile photo is now live.",
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Upload failed",
        message: getApiErrorMessage(error, "Could not upload that photo."),
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const next = await deleteAvatarApi();
      setProfile(next);
      await setUser(next);
      showSnackbar({
        variant: "success",
        title: "Photo removed",
        message: "Your profile now uses initials.",
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not remove photo",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
      showSnackbar({
        variant: "success",
        title: "Logged out",
        message: "You have been signed out.",
      });
    } catch (requestError) {
      showSnackbar({
        variant: "warning",
        title: "Signed out locally",
        message: getApiErrorMessage(
          requestError,
          "Could not reach the logout API, but your local session was cleared.",
        ),
      });
    } finally {
      await clearSession();
      router.replace("/(auth)/login");
    }
  };

  const deactivateAccount = async () => {
    setDeactivating(true);
    setError("");
    try {
      await deactivateMeApi();
      showSnackbar({
        variant: "success",
        title: "Account deactivated",
        message: "Your account was archived. You can reactivate it from login.",
      });
      await clearSession();
      setShowDeactivatePopup(false);
      router.replace("/(auth)/login");
    } catch (requestError) {
      const message = getApiErrorMessage(
        requestError,
        "Could not deactivate your account.",
      );
      setError(message);
      showSnackbar({
        variant: "error",
        title: "Deactivate failed",
        message,
      });
    } finally {
      setDeactivating(false);
    }
  };

  if (initialLoading) {
    return <PageSkeleton />;
  }

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1 bg-main dark:bg-dark-main"
        contentContainerClassName="gap-5 p-5 pb-36"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadProfile} />
        }
        showsVerticalScrollIndicator={false}
      >
      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <View className="flex-row items-center gap-4">
          <View className="relative h-[68px] w-[68px]">
            <UserAvatar
              name={profile?.fullName}
              avatarUrl={profile?.avatarUrl}
              size="xl"
            />
            {isDemo ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Profile photo actions"
                disabled={uploadingAvatar}
                onPress={() => setShowAvatarSheet(true)}
                className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-full border-2 border-sidebar bg-sidebar dark:border-dark-sidebar dark:bg-dark-sidebar"
              >
                <Ionicons
                  name={uploadingAvatar ? "hourglass-outline" : "ellipsis-horizontal"}
                  size={14}
                  color={palette.primary}
                />
              </Pressable>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[24px] font-black text-primary dark:text-dark-primary">
              {profile?.fullName ?? "Nova user"}
            </Text>
            {profile?.username ? (
              <Text className="mt-1 text-[13px] font-bold text-accent dark:text-dark-accent">
                {profile.username.startsWith("@")
                  ? profile.username
                  : `@${profile.username}`}
              </Text>
            ) : null}
            <Text className="mt-1 text-[14px] leading-5 text-muted dark:text-dark-muted">
              {profile?.roleTitle ?? "Team member"}
            </Text>
            <Text className="mt-0.5 text-[13px] text-subtle dark:text-dark-subtle">
              {profile?.email ?? ""}
            </Text>
          </View>
        </View>
        {profile?.bio ? (
          <Text className="mt-4 text-[14px] leading-5 text-muted dark:text-dark-muted">
            {profile.bio}
          </Text>
        ) : null}

        <View className="mt-5 flex-row gap-3">
          <View className="flex-1 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-xl font-black text-primary dark:text-dark-primary">
              {counts.projectCount}
            </Text>
            <Text className="mt-1 text-xs font-bold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              Projects
            </Text>
          </View>
          <View className="flex-1 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-xl font-black text-primary dark:text-dark-primary">
              {counts.taskCount}
            </Text>
            <Text className="mt-1 text-xs font-bold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              Tasks
            </Text>
          </View>
        </View>
      </View>

      {isDemo ? null : (
      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <SectionHeader
          icon="person-outline"
          title="Edit Profile"
          subtitle="Keep your public workspace details up to date."
        />
        <View className="gap-4">
          <FormField
            label="Full Name"
            value={form.fullName}
            onChangeText={(fullName) =>
              setForm((current) => ({ ...current, fullName }))
            }
            placeholder="Your full name"
          />
          <FormField
            label="Role / Title"
            value={form.roleTitle}
            onChangeText={(roleTitle) =>
              setForm((current) => ({ ...current, roleTitle }))
            }
            placeholder="e.g. Product Lead"
          />
          <FormField
            label="Username"
            value={form.username}
            onChangeText={(username) =>
              setForm((current) => ({
                ...current,
                username: username.toLowerCase().replace(/[^a-z0-9_]/g, ""),
              }))
            }
            placeholder="abdallah_zagh"
            autoCapitalize="none"
            hint={`Saved as @${form.username || "your_handle"}`}
          />
          <FormField
            label="Bio"
            value={form.bio}
            onChangeText={(bio) => setForm((current) => ({ ...current, bio }))}
            placeholder="A short bio about yourself..."
            multiline
            textAlignVertical="top"
            className="min-h-[92px]"
          />
          <PrimaryButton
            label="Save Changes"
            loading={saving}
            onPress={saveProfile}
          />
        </View>
      </View>
      )}

      {error ? (
        <View className="rounded-nova border border-danger bg-danger/10 p-3 dark:border-dark-danger dark:bg-dark-danger/10">
          <Text className="text-sm text-danger dark:text-dark-danger">
            {error}
          </Text>
        </View>
      ) : null}
      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <SectionHeader
          icon="pulse-outline"
          title="Recent Activity"
          subtitle="Your yearly task activity map."
        />
        <ActivityHeatmap activity={profile?.activity} />
      </View>

      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <SectionHeader
          icon="folder-open-outline"
          title="Projects"
          subtitle="Your project membership and assigned work."
        />
        {projects.length === 0 ? (
          <Text className="rounded-nova border border-glass bg-glass-card p-4 text-center text-sm text-muted dark:border-dark-glass dark:bg-dark-glass-card dark:text-dark-muted">
            No projects to display.
          </Text>
        ) : (
          <View className="gap-3">
            {projects.map((project: ApiUserProject) => {
              const completion = updateCompletion(project);
              return (
                <Pressable
                  key={project.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${project.name}`}
                  onPress={() =>
                    router.push({
                      pathname: "/project/[id]",
                      params: { id: project.id },
                    })
                  }
                  className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-black text-primary dark:text-dark-primary">
                        {project.name}
                      </Text>
                      <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                        {project.description || "No description"}
                      </Text>
                    </View>
                    <Text className="rounded-full border border-glass px-2 py-1 text-[10px] font-black uppercase text-accent dark:border-dark-glass dark:text-dark-accent">
                      {project.role}
                    </Text>
                  </View>
                  <View className="mt-4 flex-row flex-wrap gap-3">
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {project.status}
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {project.completedUserTasksCount ?? 0}/
                      {project.userTasksCount ?? 0} tasks
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {project.totalTasksCount ?? 0} total
                    </Text>
                  </View>
                  <View className="mt-3 h-2 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
                    <View
                      className="h-full rounded-full bg-accent dark:bg-dark-accent"
                      style={{ width: `${completion}%` }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <SectionHeader
          icon="settings-outline"
          title="Settings"
          subtitle="Display, session, and account controls."
        />

        <View className="gap-3">
          <View className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="font-extrabold text-primary dark:text-dark-primary">
                  Display Mode
                </Text>
                <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
                  Default follows your phone.
                </Text>
              </View>
              {/* <Switch
                value={mode === "dark"}
                onValueChange={(enabled) =>
                  void setMode(enabled ? "dark" : "light")
                }
                trackColor={{ false: palette.glass, true: palette.accent }}
                thumbColor={palette.white}
              /> */}
            </View>
            <View className="mt-3 flex-row rounded-full border border-glass bg-glass-button p-1 dark:border-dark-glass dark:bg-dark-glass-button">
              {appearanceOptions.map((option) => {
                const active = mode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    onPress={() => void setMode(option.value)}
                    className={`flex-1 rounded-full px-3 py-2 active:opacity-75 ${
                      active ? "bg-accent dark:bg-dark-accent" : ""
                    }`}
                  >
                    <Text
                      className={`text-center text-xs font-extrabold ${
                        active ? "text-white" : "text-muted dark:text-dark-muted"
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report a problem"
            onPress={() => setShowReportModal(true)}
            className="min-h-[58px] flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card px-4 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            <Ionicons name="flag-outline" size={20} color={palette.accent} />
            <View className="flex-1">
              <Text className="font-extrabold text-primary dark:text-dark-primary">
                Report a problem
              </Text>
              <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                Send a screenshot and details to Super Admins.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>

          {isDemo ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change password"
            onPress={() => setShowPasswordModal(true)}
            className="min-h-[58px] flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card px-4 active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            <Ionicons name="key-outline" size={20} color={palette.accent} />
            <View className="flex-1">
              <Text className="font-extrabold text-primary dark:text-dark-primary">
                Change Password
              </Text>
              <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                Verify with OTP and set a new password.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>
          )}

          {isDemo ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deactivate account"
            disabled={deactivating}
            onPress={() => setShowDeactivatePopup(true)}
            className="min-h-[58px] flex-row items-center gap-3 rounded-nova border border-danger bg-danger/10 px-4 active:opacity-75 disabled:opacity-50 dark:border-dark-danger dark:bg-dark-danger/10"
          >
            <Ionicons name="shield-outline" size={20} color={palette.danger} />
            <View className="flex-1">
              <Text className="font-extrabold text-danger dark:text-dark-danger">
                Deactivate Account
              </Text>
              <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                Archive your account and sign out.
              </Text>
            </View>
          </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={logout}
            className="min-h-[54px] flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-card active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            <Ionicons name="log-out-outline" size={20} color={palette.accent} />
            <Text className="text-[15px] font-extrabold text-accent dark:text-dark-accent">
              Log out
            </Text>
          </Pressable>
          </View>
        </View>
      </ScrollView>

      <ConfirmationPopup
        visible={showDeactivatePopup}
        title="Deactivate your account?"
        message="Your account will be archived and you will be signed out. You can reactivate later with your email and OTP."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        icon="shield-outline"
        variant="danger"
        loading={deactivating}
        onCancel={() => {
          if (!deactivating) setShowDeactivatePopup(false);
        }}
        onConfirm={() => void deactivateAccount()}
      />

      <ChangePasswordModal
        visible={showPasswordModal}
        email={profile?.email ?? ""}
        onClose={() => setShowPasswordModal(false)}
      />
      <ReportProblemModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
      />

      <ActionSheet
        visible={showAvatarSheet}
        title="Profile photo"
        onClose={() => setShowAvatarSheet(false)}
        actions={[
          {
            key: "edit",
            label: profile?.avatarUrl ? "Edit" : "Add photo",
            icon: "create-outline",
            onPress: () => {
              setTimeout(() => setShowAvatarSourceSheet(true), 250);
            },
          },
          ...(profile?.avatarUrl
            ? [
                {
                  key: "delete",
                  label: "Delete",
                  icon: "trash-outline" as const,
                  destructive: true,
                  onPress: () => void removeAvatar(),
                },
              ]
            : []),
        ]}
      />
      <ActionSheet
        visible={showAvatarSourceSheet}
        title="Edit photo"
        onClose={() => setShowAvatarSourceSheet(false)}
        actions={[
          {
            key: "camera",
            label: "Take photo",
            icon: "camera-outline",
            onPress: () => void pickAvatar("camera"),
          },
          {
            key: "library",
            label: "Choose from library",
            icon: "image-outline",
            onPress: () => void pickAvatar("library"),
          },
        ]}
      />

    </View>
  );
}
