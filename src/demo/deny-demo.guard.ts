import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { DEMO_BLOCK_KEY } from './deny-demo.decorator';
import { DemoService } from './demo.service';

@Injectable()
export class DenyDemoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly demoService: DemoService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const message = this.reflector.getAllAndOverride<string>(DEMO_BLOCK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!message) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    await this.demoService.assertNotDemo(request.user?.id, message);
    return true;
  }
}
