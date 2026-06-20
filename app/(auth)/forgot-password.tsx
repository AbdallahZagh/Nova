import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextLink } from "@/components/TextLink";
import { forgotPasswordApi, resetPasswordApi } from "@/api/auth";
import { getApiErrorMessage } from "@/api/apiClient";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { validateEmail, validatePassword } from "@/utils/validation";

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{
    step?: string;
    email?: string;
    code?: string;
  }>();
  const passwordStep =
    params.step === "password" && Boolean(params.email && params.code);
  const [email, setEmail] = useState(params.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);

  const sendCode = async () => {
    setFieldError("");
    const validation = validateEmail(email);
    if (validation) {
      setFieldError(validation);
      return;
    }
    setLoading(true);
    try {
      const response = await forgotPasswordApi(email);
      showSnackbar({
        variant: "success",
        title: "OTP sent",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : "Check your email for the reset code.",
      });
      router.push({
        pathname: "/(auth)/otp",
        params: {
          email: email.trim().toLowerCase(),
          purpose: "FORGOT_PASSWORD",
        },
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Reset failed",
        message: getApiErrorMessage(error, "Could not send the reset code."),
      });
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setFieldError("");
    const passwordValidation = validatePassword(newPassword);
    if (passwordValidation) {
      setFieldError(passwordValidation);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPasswordApi(params.email ?? "", params.code ?? "", newPassword);
      showSnackbar({
        variant: "success",
        title: "Password updated",
        message: "Sign in with your new password.",
      });
      router.replace({
        pathname: "/(auth)/login",
        params: { reason: "password_reset" },
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Password update failed",
        message: getApiErrorMessage(error, "Could not update your password."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="Account recovery"
      title={passwordStep ? "Choose new password" : "Reset password"}
      subtitle={
        passwordStep
          ? "Your OTP is verified. Set a secure new password."
          : "We will send a one-time code to your registered email."
      }
      footer={
        <View className="w-full flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">Remembered it?</Text>
          <TextLink label="Back to sign in" onPress={() => router.replace("/(auth)/login")} />
        </View>
      }
    >
      <View className="gap-4">
        {passwordStep ? (
          <>
            <FormField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              textContentType="newPassword"
              password
            />
            <FormField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              textContentType="newPassword"
              password
              error={fieldError}
            />
            <PrimaryButton
              label="Set new password"
              loading={loading}
              onPress={resetPassword}
            />
          </>
        ) : (
          <>
            <FormField
              label="Registered email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@company.com"
              textContentType="emailAddress"
              error={fieldError}
            />
            <PrimaryButton label="Send OTP" loading={loading} onPress={sendCode} />
          </>
        )}
      </View>
    </AuthScreen>
  );
}
