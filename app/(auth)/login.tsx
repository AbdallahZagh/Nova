import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextLink } from "@/components/TextLink";
import {
  getApiErrorMessage,
  isInactiveAccountError,
} from "@/api/apiClient";
import { loginApi, reactivateApi, getDemoCredentialsApi } from "@/api/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ reason?: string }>();
  const setSession = useAuthStore((state) => state.setSession);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const notice =
    params.reason === "session_expired"
      ? "Your session expired. Sign in again to continue."
      : params.reason === "verified"
        ? "Email verified. You can sign in now."
        : params.reason === "password_reset"
          ? "Password updated. Sign in with your new password."
          : "";

  const beginReactivation = async (email: string) => {
    await reactivateApi(email);
    showSnackbar({
      variant: "info",
      title: "Account archived",
      message: "We sent a reactivation code to your email.",
    });
    router.push({
      pathname: "/(auth)/otp",
      params: {
        email: email.trim().toLowerCase(),
        purpose: "REACTIVATE",
      },
    });
  };

  const submit = async () => {
    if (!identifier.trim()) {
      showSnackbar({
        variant: "error",
        title: "Email or username required",
        message: "Enter your email address or username.",
      });
      return;
    }
    if (!password) {
      showSnackbar({
        variant: "error",
        title: "Password required",
        message: "Enter your password to continue.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await loginApi(identifier, password);
      if (response.user.isActive === false || response.user.isArchived === true) {
        await beginReactivation(response.user.email);
        return;
      }
      await setSession(response);
      showSnackbar({ variant: "success", title: "Welcome back" });
      router.replace("/(main)");
    } catch (requestError) {
      if (isInactiveAccountError(requestError)) {
        try {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
            showSnackbar({
              variant: "error",
              title: "Sign in failed",
              message: getApiErrorMessage(
                requestError,
                "This account needs to be reactivated with the email on file.",
              ),
            });
            return;
          }
          await beginReactivation(identifier.trim());
        } catch (reactivateError) {
          showSnackbar({
            variant: "error",
            title: "Reactivation failed",
            message: getApiErrorMessage(
              reactivateError,
              "Could not send a reactivation code.",
            ),
          });
        }
      } else {
        showSnackbar({
          variant: "error",
          title: "Sign in failed",
          message: getApiErrorMessage(requestError, "Unable to sign in. Try again."),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const submitDemo = async () => {
    setDemoLoading(true);
    try {
      const demo = await getDemoCredentialsApi();
      const response = await loginApi(demo.email, demo.password);
      if (response.user.isActive === false || response.user.isArchived === true) {
        showSnackbar({
          variant: "error",
          title: "Demo unavailable",
          message: "The demo account is not active right now.",
        });
        return;
      }
      await setSession(response);
      showSnackbar({
        variant: "success",
        title: "Demo workspace",
        message: "A short tour will explain what you can try.",
      });
      router.replace("/(main)");
    } catch (requestError) {
      showSnackbar({
        variant: "error",
        title: "Demo unavailable",
        message: getApiErrorMessage(requestError, "Demo sign-in is unavailable right now."),
      });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="Welcome back"
      title="Sign in to Nova"
      subtitle="Continue to your projects, tasks, and team workspace."
      footer={
        <View className="w-full flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">New to Nova?</Text>
          <TextLink label="Create account" onPress={() => router.push("/(auth)/register")} />
        </View>
      }
    >
      <View className="gap-4">
        <FormField
          label="Email or username"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          placeholder="you@company.com or @username"
          textContentType="username"
        />
        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          textContentType="password"
          password
        />
        <View className="-mt-1 items-end">
          <TextLink
            label="Forgot password?"
            onPress={() => router.push("/(auth)/forgot-password")}
          />
        </View>
        {notice ? (
          <Text className="rounded-nova border border-glass bg-glass-card p-3 text-xs font-bold text-muted dark:border-dark-glass dark:bg-dark-glass-card dark:text-dark-muted">
            {notice}
          </Text>
        ) : null}
        <PrimaryButton
          label="Sign in"
          loading={loading}
          disabled={demoLoading}
          onPress={submit}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try demo"
          disabled={loading || demoLoading}
          onPress={() => void submitDemo()}
          className={`min-h-[50px] items-center justify-center rounded-nova border border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card ${
            loading || demoLoading ? "opacity-50" : "active:opacity-75"
          }`}
        >
          <Text className="text-[15px] font-extrabold text-primary dark:text-dark-primary">
            {demoLoading ? "Opening demo..." : "Try demo"}
          </Text>
        </Pressable>
        <Text className="text-center text-xs font-bold text-muted dark:text-dark-muted">
          Shared sandbox for portfolios. No email required.
        </Text>
      </View>
    </AuthScreen>
  );
}
