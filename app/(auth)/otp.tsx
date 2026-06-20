import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { OtpInput } from "@/components/OtpInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextLink } from "@/components/TextLink";
import { getMeApi, resendOtpApi, verifyOtpApi } from "@/api/auth";
import type { OtpPurpose } from "@/api/types";
import { getApiErrorMessage } from "@/api/apiClient";
import { useCountdown } from "@/hooks/useCountdown";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

function isOtpPurpose(value: string | undefined): value is OtpPurpose {
  return value === "REGISTER" || value === "FORGOT_PASSWORD" || value === "REACTIVATE";
}

export default function OtpScreen() {
  const params = useLocalSearchParams<{ email?: string; purpose?: string }>();
  const setSession = useAuthStore((state) => state.setSession);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const email = params.email?.trim() ?? "";
  const purpose = isOtpPurpose(params.purpose) ? params.purpose : "REGISTER";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const countdown = useCountdown(30);

  const verify = async () => {
    if (!email) {
      showSnackbar({
        variant: "error",
        title: "Email missing",
        message: "The verification email is missing. Return and try again.",
      });
      return;
    }
    if (code.length !== 6) {
      showSnackbar({
        variant: "error",
        title: "Incomplete OTP",
        message: "Enter the complete 6-digit code.",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await verifyOtpApi(email, code, purpose);
      if (purpose === "FORGOT_PASSWORD") {
        showSnackbar({ variant: "success", title: "OTP verified" });
        router.replace({
          pathname: "/(auth)/forgot-password",
          params: { step: "password", email, code },
        });
      } else if (purpose === "REACTIVATE" && response.accessToken) {
        const user = response.user ?? (await getMeApi(response.accessToken));
        await setSession({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user,
        });
        showSnackbar({
          variant: "success",
          title: "Welcome back",
          message: response.message || "Your account has been reactivated.",
        });
        router.replace("/(main)");
      } else {
        showSnackbar({
          variant: "success",
          title: "Email verified",
          message: "You can sign in now.",
        });
        router.replace({
          pathname: "/(auth)/login",
          params: { reason: "verified" },
        });
      }
    } catch (requestError) {
      showSnackbar({
        variant: "error",
        title: "OTP failed",
        message: getApiErrorMessage(requestError, "Invalid or expired OTP code."),
      });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!countdown.canRun || loading || !email) return;
    setLoading(true);
    try {
      const response = await resendOtpApi(email, purpose);
      setCode("");
      countdown.restart();
      showSnackbar({
        variant: "success",
        title: "OTP resent",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : response.message,
      });
    } catch (requestError) {
      showSnackbar({
        variant: "error",
        title: "Resend failed",
        message: getApiErrorMessage(requestError, "Could not resend the code."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="Email verification"
      title="Enter your code"
      subtitle={`Enter the 6-digit code sent to ${email || "your email address"}.`}
      footer={
        <View className="w-full flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">Wrong email?</Text>
          <TextLink label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <View className="gap-[18px]">
        <OtpInput value={code} onChange={setCode} disabled={loading} />
        <PrimaryButton
          label={purpose === "REACTIVATE" ? "Reactivate account" : "Verify OTP"}
          loading={loading}
          disabled={code.length !== 6}
          onPress={verify}
        />
        <View className="flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">Did not receive it?</Text>
          <TextLink
            label={countdown.canRun ? "Resend code" : `Resend in ${countdown.seconds}s`}
            disabled={!countdown.canRun || loading}
            onPress={resend}
          />
        </View>
      </View>
    </AuthScreen>
  );
}
