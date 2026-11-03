import { createHash, randomBytes } from 'crypto';

export function randomToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
