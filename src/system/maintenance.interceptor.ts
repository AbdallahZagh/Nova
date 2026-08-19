import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../common/roles';
import { SystemSettingsService } from './system-settings.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const WHITELIST = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/reactivate',
  '/api/auth/demo',
  '/api/health',
  '/api/system/status',
  '/api/support/tickets',
  '/api/_/provision',
]);

@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  constructor(private readonly settings: SystemSettingsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthUser }
    >();
    const method = (request.method || 'GET').toUpperCase();
    if (!MUTATING.has(method)) return next.handle();

    const path = (request.originalUrl || request.url || '').split('?')[0];
    if (WHITELIST.has(path) || path.startsWith('/api/admin/')) {
      return next.handle();
    }

    if (!this.settings.getCached().maintenanceMode) return next.handle();
    if (request.user?.role === UserRole.SUPER_ADMIN) return next.handle();

    throw new ServiceUnavailableException(
      'Nova is currently undergoing scheduled maintenance.',
    );
  }
}

export function isMaintenanceError(error: unknown) {
  return (
    error instanceof HttpException &&
    error.getStatus() === 503
  );
}
