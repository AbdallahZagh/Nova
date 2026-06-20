import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { AuthScreen } from "@/components/AuthScreen";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TextLink } from "@/components/TextLink";
import { registerApi } from "@/api/auth";
import { getApiErrorMessage } from "@/api/apiClient";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/utils/validation";

type RegisterErrors = Partial<
  Record<
    "fullName" | "username" | "email" | "roleTitle" | "password" | "confirmPassword",
    string
  >
>;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [loading, setLoading] = useState(false);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);

  const validate = () => {
    const next: RegisterErrors = {};
    if (fullName.trim().length < 2) next.fullName = "Enter your full name.";
    next.username = validateUsername(username) || undefined;
    next.email = validateEmail(email) || undefined;
    if (!roleTitle.trim()) next.roleTitle = "Role or job title is required.";
    next.password = validatePassword(password) || undefined;
    if (confirmPassword !== password) {
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const response = await registerApi({
        fullName,
        username,
        email,
        roleTitle,
        password,
      });
      showSnackbar({
        variant: "success",
        title: "Account created",
        message: response._devOtp
          ? `Development OTP: ${response._devOtp}`
          : "Check your email for the verification code.",
      });
      router.push({
        pathname: "/(auth)/otp",
        params: {
          email: email.trim().toLowerCase(),
          purpose: "REGISTER",
        },
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Registration failed",
        message: getApiErrorMessage(
          error,
          "Could not create your account. Try again.",
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      eyebrow="Get started"
      title="Create account"
      subtitle="Join Nova and verify your email to activate the workspace."
      footer={
        <View className="w-full flex-row items-center justify-center gap-1.5">
          <Text className="text-muted dark:text-dark-muted">Already registered?</Text>
          <TextLink label="Sign in" onPress={() => router.replace("/(auth)/login")} />
        </View>
      }
    >
      <View className="gap-[15px]">
        <FormField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Sarah Johnson"
          textContentType="name"
          error={errors.fullName}
        />
        <FormField
          label="Username"
          value={username}
          onChangeText={(value) =>
            setUsername(value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))
          }
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="sarah_johnson"
          hint="Lowercase letters, numbers, and underscores."
          error={errors.username}
        />
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@company.com"
          textContentType="emailAddress"
          error={errors.email}
        />
        <FormField
          label="Role or title"
          value={roleTitle}
          onChangeText={setRoleTitle}
          placeholder="Product Designer"
          error={errors.roleTitle}
        />
        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          textContentType="newPassword"
          password
          error={errors.password}
        />
        <FormField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repeat password"
          textContentType="newPassword"
          password
          error={errors.confirmPassword}
        />
        <PrimaryButton label="Create account" loading={loading} onPress={submit} />
      </View>
    </AuthScreen>
  );
}
