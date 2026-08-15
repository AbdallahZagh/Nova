const USERNAME_BODY_RE = /^[a-z0-9_]+$/;

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Strip spaces, lowercase, ensure leading @ (e.g. abdallah_zagh → @abdallah_zagh). */
export function normalizeUsername(raw: string): string {
  let body = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (body.startsWith("@")) body = body.slice(1);
  body = body.replace(/[^a-z0-9_]/g, "");
  if (!body) return "";
  return `@${body}`;
}

/** Body-only value for inputs that show a fixed @ prefix. */
export function usernameToBody(username: string): string {
  const normalized = normalizeUsername(username);
  return normalized ? normalized.slice(1) : "";
}

export function bodyToUsername(body: string): string {
  return normalizeUsername(body);
}

export function validateUsername(raw: string): string | null {
  const normalized = normalizeUsername(raw);
  if (!normalized) {
    return "Username is required.";
  }
  const body = normalized.slice(1);
  if (body.length < 1) {
    return "Add at least one letter, number, or underscore after @.";
  }
  if (!USERNAME_BODY_RE.test(body)) {
    return "Use only lowercase letters, numbers, and underscores.";
  }
  return null;
}
