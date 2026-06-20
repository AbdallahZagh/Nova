import { apiClient, publicApiClient } from "./apiClient";
import type {
  ApiUser,
  LoginResponse,
  LogoutResponse,
  MessageResponse,
  OtpPurpose,
  UpdateProfilePayload,
} from "./types";

export type RegisterPayload = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  roleTitle: string;
};

export async function loginApi(identifier: string, password: string) {
  const { data } = await publicApiClient.post<LoginResponse>("/api/auth/login", {
    email: identifier.trim(),
    password,
  });
  return data;
}

export async function logoutApi() {
  const { data } = await apiClient.post<LogoutResponse>("/api/auth/logout");
  return data;
}

export async function registerApi(payload: RegisterPayload) {
  const { data } = await publicApiClient.post<MessageResponse>("/api/auth/register", {
    fullName: payload.fullName.trim(),
    username: payload.username.trim().replace(/^@/, ""),
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    roleTitle: payload.roleTitle.trim(),
  });
  return data;
}

export async function verifyOtpApi(
  email: string,
  code: string,
  purpose: OtpPurpose,
) {
  const { data } = await publicApiClient.post<MessageResponse>("/api/auth/verify-otp", {
    email: email.trim().toLowerCase(),
    code: code.trim(),
    purpose,
  });
  return data;
}

export async function resendOtpApi(email: string, purpose: OtpPurpose) {
  const { data } = await publicApiClient.post<MessageResponse>("/api/auth/resend-otp", {
    email: email.trim().toLowerCase(),
    purpose,
  });
  return data;
}

export async function forgotPasswordApi(email: string) {
  const { data } = await publicApiClient.post<MessageResponse>(
    "/api/auth/forgot-password",
    { email: email.trim().toLowerCase() },
  );
  return data;
}

export async function resetPasswordApi(
  email: string,
  code: string,
  newPassword: string,
) {
  const { data } = await publicApiClient.post<MessageResponse>(
    "/api/auth/reset-password",
    {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      newPassword,
    },
  );
  return data;
}

export async function reactivateApi(email: string) {
  const { data } = await publicApiClient.post<MessageResponse>("/api/auth/reactivate", {
    email: email.trim().toLowerCase(),
  });
  return data;
}

export async function getMeApi(accessToken?: string) {
  const client = accessToken ? publicApiClient : apiClient;
  const { data } = await client.get<ApiUser>("/api/users/me", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  return data;
}

export async function updateMeApi(payload: UpdateProfilePayload) {
  const body = {
    fullName: payload.fullName?.trim() ?? payload.name?.trim(),
    name: payload.name?.trim() ?? payload.fullName?.trim(),
    username: payload.username?.trim().replace(/^@/, ""),
    roleTitle: payload.roleTitle?.trim() ?? payload.role?.trim(),
    role: payload.role?.trim() ?? payload.roleTitle?.trim(),
    bio: payload.bio?.trim() ?? "",
  };
  const { data } = await apiClient.patch<ApiUser>("/api/users/me", body);
  return data;
}

export async function deactivateMeApi() {
  const { data } = await apiClient.delete<MessageResponse>("/api/users/me");
  return data;
}
