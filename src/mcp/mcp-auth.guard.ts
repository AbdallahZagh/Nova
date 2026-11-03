import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { NovaOAuthProvider } from '../oauth/oauth.provider';
import { wwwAuthenticate } from '../oauth/oauth.urls';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly oauth: NovaOAuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: unknown }>();
    const res = http.getResponse<Response>();
    const header = req.headers.authorization;
    const token = typeof header === 'string' ? header.split(' ')[1] : undefined;

    try {
      if (!token) throw new Error('Missing Authorization header');
      const auth = await this.oauth.verifyAccessToken(token);
      req.user = this.oauth.userFromAuth(auth);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      res.setHeader('WWW-Authenticate', wwwAuthenticate(message));
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
