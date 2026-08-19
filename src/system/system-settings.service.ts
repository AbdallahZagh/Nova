import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CachedSystemSettings = {
  id: string;
  maintenanceMode: boolean;
  broadcastBanner: string | null;
  aiEnabled: boolean;
  defaultAiDailyQuota: number;
  registrationsEnabled: boolean;
  fcmEnabled: boolean;
  whiteboardRealtimeEnabled: boolean;
};

const SETTINGS_ID = 'default';
const TTL_MS = 10_000;

@Injectable()
export class SystemSettingsService implements OnModuleInit {
  private cached: CachedSystemSettings | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRow();
    await this.refresh();
  }

  getCached(): CachedSystemSettings {
    if (this.cached && Date.now() - this.cachedAt < TTL_MS) {
      return this.cached;
    }
    return (
      this.cached ?? {
        id: SETTINGS_ID,
        maintenanceMode: false,
        broadcastBanner: null,
        aiEnabled: true,
        defaultAiDailyQuota: 20,
        registrationsEnabled: true,
        fcmEnabled: true,
        whiteboardRealtimeEnabled: true,
      }
    );
  }

  async getFresh() {
    if (this.cached && Date.now() - this.cachedAt < TTL_MS) {
      return this.cached;
    }
    return this.refresh();
  }

  invalidate() {
    this.cached = null;
    this.cachedAt = 0;
  }

  async refresh() {
    const row = await this.ensureRow();
    this.cached = {
      id: row.id,
      maintenanceMode: row.maintenanceMode,
      broadcastBanner: row.broadcastBanner,
      aiEnabled: row.aiEnabled,
      defaultAiDailyQuota: row.defaultAiDailyQuota,
      registrationsEnabled: row.registrationsEnabled,
      fcmEnabled: row.fcmEnabled,
      whiteboardRealtimeEnabled: row.whiteboardRealtimeEnabled,
    };
    this.cachedAt = Date.now();
    return this.cached;
  }

  private async ensureRow() {
    return this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }
}
