import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/strategies/jwt.strategy';

/**
 * Extracts the authenticated user (or a specific property of it) from the request.
 *
 * Usage:
 *   @CurrentUser()          → returns the full AuthUser { id, email }
 *   @CurrentUser('id')      → returns the user UUID string
 *   @CurrentUser('email')   → returns the user email string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
