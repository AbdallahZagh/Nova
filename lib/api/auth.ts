import { apiFetch } from "@/lib/api/client";
import { normalizeUsername } from "@/lib/username";
import type { LoginResponse, LogoutResponse } from "@/lib/api/types";

export type RegisterPayload = {
  email: string;
  password: string;
  fullName: string;
  username: string;
  roleTitle: string;
};

export type RegisterResponse = {
  message: string;
  /** Dev-only OTP returned until email sending is integrated */
  _devOtp?: string;
};

export async function registerApi(payload: RegisterPayload) {
  return apiFetch<RegisterResponse>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      email: payload.email.trim(),
      password: payload.password,
      fullName: payload.fullName.trim(),
      roleTitle: payload.roleTitle.trim(),
      username: normalizeUsername(payload.username),
    }),
  });
}

export async function loginApi(email: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutApi() {
  return apiFetch<LogoutResponse>("/api/auth/logout", {
    method: "POST",
  });
}

export type ForgotPasswordResponse = {
  message: string;
  /** Dev-only OTP returned until email sending is integrated */
  _devOtp?: string;
};

export async function forgotPasswordApi(email: string) {
  return apiFetch<ForgotPasswordResponse>("/api/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email }),
  });
}

export type OtpPurpose = "REGISTER" | "FORGOT_PASSWORD" | "REACTIVATE";

export type ResendOtpResponse = {
  message: string;
  /** Dev-only OTP returned until email sending is integrated */
  _devOtp?: string;
};

export async function resendOtpApi(email: string, purpose: OtpPurpose) {
  return apiFetch<ResendOtpResponse>("/api/auth/resend-otp", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim(), purpose }),
  });
}

export type VerifyOtpResponse = {
  message: string;
  /** Issued when purpose is REACTIVATE */
  accessToken?: string;
};

export async function verifyOtpApi(
  email: string,
  code: string,
  purpose: OtpPurpose,
) {
  return apiFetch<VerifyOtpResponse>("/api/auth/verify-otp", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim(), code: code.trim(), purpose }),
  });
}

export type ReactivateResponse = {
  message: string;
  _devOtp?: string;
};

export async function reactivateApi(email: string) {
  return apiFetch<ReactivateResponse>("/api/auth/reactivate", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim() }),
  });
}

export type ResetPasswordResponse = { message: string };

export async function resetPasswordApi(
  email: string,
  code: string,
  newPassword: string,
) {
  return apiFetch<ResetPasswordResponse>("/api/auth/reset-password", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      email: email.trim(),
      code: code.trim(),
      newPassword,
    }),
  });
}
