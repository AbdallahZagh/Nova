import { BadRequestException } from '@nestjs/common';

/** @username — lowercase letters, digits, underscores only; must start with @ */
export const USERNAME_PATTERN = /^@[a-z0-9_]+$/;

export function normalizeUsername(raw: string): string {
  let value = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!value.startsWith('@')) {
    value = `@${value}`;
  }
  return value;
}

export function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new BadRequestException(
      'Username must start with @ and contain only lowercase letters, numbers, and underscores (no spaces)',
    );
  }
}
