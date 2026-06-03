import { ApiError } from "@/lib/api/client";

export function isAccountDeactivatedError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 401) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("deactivated") || msg.includes("reactivate");
}

export function isAccountUnverifiedError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 401) return false;
  return err.message.toLowerCase().includes("not yet verified");
}
