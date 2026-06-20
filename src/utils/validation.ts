export function validateEmail(value: string) {
  if (!value.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return "Enter a valid email address.";
  }
  return "";
}

export function validateUsername(value: string) {
  const normalized = value.trim().replace(/^@/, "");
  if (!normalized) return "Username is required.";
  if (normalized.length < 3 || normalized.length > 30) {
    return "Username must be between 3 and 30 characters.";
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return "Use lowercase letters, numbers, and underscores only.";
  }
  return "";
}

export function validatePassword(value: string) {
  if (value.length < 8) return "Password must be at least 8 characters.";
  return "";
}

