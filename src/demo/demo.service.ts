import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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
    const user = await seedDemoWorkspace(this.prisma as never);
    this.logger.log(`Demo workspace reset for ${user.id}`);
    return user;
  }

  @Cron('0 3 * * *')
  async nightlyReset() {
    try {
      await this.resetWorkspace();
    } catch (error) {
      this.logger.error('Demo nightly reset failed', error);
    }
  }
}
