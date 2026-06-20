import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextLink } from "@/components/TextLink";
import { reactivateApi } from "@/api/auth";
import { getApiErrorMessage } from "@/api/apiClient";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { validateEmail } from "@/utils/validation";

export default function ReactivateScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);

  const requestCode = async () => {
    setFieldError("");
    const validation = validateEmail(email);
    if (validation) {
      setFieldError(validation);
      return;
    }
    setLoading(true);
    try {
      const response = await reactivateApi(email);
      showSnackbar({
        variant: "success",
        title: "OTP sent",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : "Check your email for the reactivation code.",
      });
      router.push({
        pathname: "/(auth)/otp",
        params: {
          email: email.trim().toLowerCase(),
          purpose: "REACTIVATE",
        },
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Reactivation failed",
        message: getApiErrorMessage(
          error,
          "Could not request account reactivation.",
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="Restore access"
      title="Reactivate account"
      subtitle="Archived accounts keep their projects and tasks. Verify your email to restore access."
      footer={
        <View className="w-full flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">Account active?</Text>
          <TextLink label="Return to sign in" onPress={() => router.replace("/(auth)/login")} />
        </View>
      }
    >
      <View className="gap-4">
        <View className="rounded-[14px] border border-glass bg-glass-card p-[15px]">
          <Text className="text-[15px] font-extrabold text-primary">
            Your workspace data is preserved
          </Text>
          <Text className="mt-1.5 text-[13px] leading-5 text-muted">
            Reactivation sends a six-digit email code. After verification, Nova restores your authenticated session.
          </Text>
        </View>
        <FormField
          label="Account email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@company.com"
          textContentType="emailAddress"
          error={fieldError}
        />
        <PrimaryButton
          label="Send reactivation code"
          loading={loading}
          onPress={requestCode}
        />
      </View>
    </AuthScreen>
  );
}
