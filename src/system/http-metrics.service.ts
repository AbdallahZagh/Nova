import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

type Bucket = { count: number; errorCount: number; latencySum: number };

@Injectable()
export class HttpMetricsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(HttpMetricsService.name);
  private readonly buckets = new Map<number, Bucket>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    return this.recordCron('http-metrics', 'ok');
  }

  record(statusCode: number, latencyMs: number) {
    const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
    const current = this.buckets.get(minuteStart) ?? {
      count: 0,
      errorCount: 0,
      latencySum: 0,
    };
    current.count += 1;
    if (statusCode >= 400) current.errorCount += 1;
    current.latencySum += Math.max(0, latencyMs);
    this.buckets.set(minuteStart, current);
  }

  @Cron('0 * * * * *')
  async flushCompleted() {
    const currentMinute = Math.floor(Date.now() / 60_000) * 60_000;
    const keys = [...this.buckets.keys()].filter((key) => key < currentMinute);
    await this.flushKeys(keys);
  }

  async onApplicationShutdown() {
    await this.flushKeys([...this.buckets.keys()]);
  }

  private async flushKeys(keys: number[]) {
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      this.buckets.delete(key);
      const minuteStart = new Date(key);
      try {
        await this.prisma.httpMetricRollup.upsert({
          where: { minuteStart },
          create: {
            minuteStart,
            count: bucket.count,
            errorCount: bucket.errorCount,
            latencySum: bucket.latencySum,
          },
          update: {
            count: { increment: bucket.count },
            errorCount: { increment: bucket.errorCount },
            latencySum: { increment: bucket.latencySum },
          },
        });
      } catch (error) {
        this.logger.warn(
          `Could not flush HTTP metrics: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const existing = this.buckets.get(key) ?? {
          count: 0,
          errorCount: 0,
          latencySum: 0,
        };
        this.buckets.set(key, {
          count: existing.count + bucket.count,
          errorCount: existing.errorCount + bucket.errorCount,
          latencySum: existing.latencySum + bucket.latencySum,
        });
      }
    }
  }

  async recordCron(name: string, status: string, error?: string) {
    const now = new Date();
    await this.prisma.cronJobRun.upsert({
      where: { name },
      create: {
        name,
        lastStartedAt: now,
        lastFinishedAt: now,
        lastStatus: status,
        lastError: error ?? null,
      },
      update: {
        lastStartedAt: now,
        lastFinishedAt: now,
        lastStatus: status,
        lastError: error ?? null,
      },
    });
  }
}
