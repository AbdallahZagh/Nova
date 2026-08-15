/** @username — lowercase letters, digits, underscores only; must start with @ */
export const USERNAME_PATTERN = /^@[a-z0-9_]+$/;

export function normalizeUsername(raw: string): string {
  let value = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!value.startsWith('@')) {
    value = `@${value}`;
  }
  return value;
}
