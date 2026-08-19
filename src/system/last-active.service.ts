import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const FLUSH_EVERY_MS = 60_000;

@Injectable()
export class LastActiveService {
  private readonly lastFlush = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  touch(userId?: string | null) {
    if (!userId) return;
    const now = Date.now();
    const previous = this.lastFlush.get(userId) ?? 0;
    if (now - previous < FLUSH_EVERY_MS) return;
    this.lastFlush.set(userId, now);
    void this.prisma.user
      .update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => {
        this.lastFlush.delete(userId);
      });
  }
}
