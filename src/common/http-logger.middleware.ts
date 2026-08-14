import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SKIP_PREFIXES = ['/api/health', '/api/docs', '/favicon.ico'];

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const url = req.originalUrl || req.url || '';
    if (url === '/' || SKIP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      next();
      return;
    }

    const started = Date.now();
    res.on('finish', () => {
      const line = `${req.method} ${url} ${res.statusCode} ${Date.now() - started}ms`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
