export const AUTH_COOKIE = "taskflow-session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionCookieSuffix() {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `; Path=/; SameSite=Lax${secure}`;
}

/** Middleware only checks that this cookie exists. The API token stays in localStorage. */
export function writeSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE}=authenticated; Max-Age=${SESSION_MAX_AGE}${sessionCookieSuffix()}`;
}

export function clearSessionCookieClient() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_COOKIE}=; Max-Age=0${sessionCookieSuffix()}`;
}

/** Example credentials from API docs */
export const DEMO_EMAIL = "sarah.johnson@devteam.io";
export const DEMO_PASSWORD = "SecureP@ss123";
