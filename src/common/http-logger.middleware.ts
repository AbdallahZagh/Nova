import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { HttpMetricsService } from '../system/http-metrics.service';

const SKIP_PREFIXES = ['/api/health', '/api/docs', '/favicon.ico', '/api/_/'];

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metrics: HttpMetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const url = req.originalUrl || req.url || '';
    if (url === '/' || SKIP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      next();
      return;
    }

    const started = Date.now();
    res.on('finish', () => {
      const elapsed = Date.now() - started;
      const line = `${req.method} ${url} ${res.statusCode} ${elapsed}ms`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
      this.metrics.record(res.statusCode, elapsed);
    });

    next();
  }
}
