import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { LastActiveService } from './last-active.service';

@Injectable()
export class LastActiveInterceptor implements NestInterceptor {
  constructor(private readonly lastActive: LastActiveService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    this.lastActive.touch(request.user?.id);
    return next.handle();
  }
}
