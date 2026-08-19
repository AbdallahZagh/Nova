import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HttpMetricsService } from '../system/http-metrics.service';
import {
  DEMO_BLOCK_MESSAGE,
  DEMO_EMAIL,
  DEMO_MAX_TASKS,
  DEMO_PASSWORD,
} from './demo.constants';
import { seedDemoWorkspace } from './seed-demo';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: HttpMetricsService,
  ) {}

  credentials() {
    return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  }

  async isDemoUserId(userId?: string | null) {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDemo: true },
    });
    return Boolean(user?.isDemo);
  }

  async isDemoEmail(email?: string | null) {
    return (email ?? '').trim().toLowerCase() === DEMO_EMAIL;
  }

  async assertNotDemo(userId?: string | null, message = DEMO_BLOCK_MESSAGE) {
    if (await this.isDemoUserId(userId)) {
      throw new ForbiddenException(message);
    }
  }

  async assertNotDemoEmail(email?: string | null, message = DEMO_BLOCK_MESSAGE) {
    if (await this.isDemoEmail(email)) {
      throw new ForbiddenException(message);
    }
  }

  async assertCanCreateTask(userId: string) {
    if (!(await this.isDemoUserId(userId))) return;
    const count = await this.prisma.task.count({
      where: {
        project: { ownerId: userId },
      },
    });
    if (count >= DEMO_MAX_TASKS) {
      throw new ForbiddenException(
        `The demo account can keep up to ${DEMO_MAX_TASKS} tasks. Delete one or wait for the nightly reset.`,
      );
    }
  }

  async resetWorkspace() {
    await this.summarizeDay();
    const user = await seedDemoWorkspace(this.prisma as never);
    this.logger.log(`Demo workspace reset for ${user.id}`);
    return user;
  }

  @Cron('0 3 * * *')
  async nightlyReset() {
    try {
      await this.metrics.recordCron('demo-reset', 'running');
      await this.resetWorkspace();
      await this.metrics.recordCron('demo-reset', 'ok');
    } catch (error) {
      await this.metrics.recordCron(
        'demo-reset',
        'error',
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error('Demo nightly reset failed', error);
    }
  }

  visitorHash(ip?: string | null, userAgent?: string | null) {
    return createHash('sha256')
      .update(`${ip ?? ''}|${userAgent ?? ''}`)
      .digest('hex')
      .slice(0, 32);
  }

  async openSession(input: {
    userId: string;
    platform?: string;
    appVersion?: string;
    visitorHash?: string;
  }) {
    const open = await this.prisma.demoSession.findFirst({
      where: { userId: input.userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (open) return open;
    return this.prisma.demoSession.create({
      data: {
        userId: input.userId,
        platform: input.platform,
        appVersion: input.appVersion,
        visitorHash: input.visitorHash,
      },
    });
  }

  async bumpSession(
    userId: string,
    kind: 'request' | 'mutation' | 'blocked',
  ) {
    const open = await this.prisma.demoSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return;
    const data =
      kind === 'mutation'
        ? { mutationCount: { increment: 1 }, requestCount: { increment: 1 } }
        : kind === 'blocked'
          ? { blockedCount: { increment: 1 }, requestCount: { increment: 1 } }
          : { requestCount: { increment: 1 } };
    await this.prisma.demoSession.update({ where: { id: open.id }, data });
  }

  async recordEvent(input: {
    userId: string;
    action: string;
    ok?: boolean;
    route?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const session = await this.openSession({ userId: input.userId });
    await this.prisma.demoEvent.create({
      data: {
        sessionId: session.id,
        userId: input.userId,
        action: input.action,
        ok: input.ok ?? true,
        route: input.route,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    if (input.ok === false) {
      await this.prisma.demoSession.update({
        where: { id: session.id },
        data: { blockedCount: { increment: 1 } },
      });
    }
  }

  private async summarizeDay() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sessions = await this.prisma.demoSession.findMany({
      where: { startedAt: { gte: new Date(start.getTime() - 86_400_000) } },
    });
    const events = await this.prisma.demoEvent.findMany({
      where: { createdAt: { gte: new Date(start.getTime() - 86_400_000) } },
    });
    const actionCounts = new Map<string, number>();
    const blockCounts = new Map<string, number>();
    for (const event of events) {
      actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1);
      if (!event.ok) {
        blockCounts.set(event.action, (blockCounts.get(event.action) ?? 0) + 1);
      }
    }
    await this.prisma.demoDaySummary.create({
      data: {
        day: start,
        sessionCount: sessions.length,
        uniqueVisitors: new Set(
          sessions.map((row) => row.visitorHash).filter(Boolean),
        ).size,
        mutationCount: sessions.reduce((sum, row) => sum + row.mutationCount, 0),
        blockedCount: sessions.reduce((sum, row) => sum + row.blockedCount, 0),
        topActions: [...actionCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
        topBlocks: [...blockCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
      },
    }).catch(() => undefined);
    await this.prisma.demoSession.updateMany({
      where: { endedAt: null },
      data: { endedAt: new Date() },
    });
  }
}
