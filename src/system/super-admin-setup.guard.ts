import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const SETUP_KEY_HEADER = 'x-setup-key';

@Injectable()
export class SuperAdminSetupGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.SUPER_ADMIN_SETUP_KEY?.trim();
    if (!expected) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<Request>();
    const provided = String(request.headers[SETUP_KEY_HEADER] ?? '').trim();
    if (!provided || !safeEqual(provided, expected)) {
      throw new NotFoundException();
    }
    return true;
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
