import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminBroadcastScope,
  SupportReplyChannel,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { EmailService } from '../mail/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DemoService } from '../demo/demo.service';
import { SystemSettingsService } from '../system/system-settings.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    actorId: string,
    action: string,
    targetType: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: { actorId, action, targetType, targetId, metadata },
    });
  }
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly demo: DemoService,
    private readonly audit: AdminAuditService,
  ) {}

  async overview() {
    const dayStart = startOfDay(new Date());
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const hourAgo = new Date(Date.now() - 3_600_000);

    const [
      users,
      activeUsers,
      projects,
      tasks,
      boards,
      openTickets,
      aiToday,
      registered,
      verified,
      withProject,
      rollups,
      crons,
      storage,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, isArchived: false } }),
      this.prisma.project.count(),
      this.prisma.task.count(),
      this.prisma.whiteboard.count(),
      this.prisma.supportTicket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_USER'] } },
      }),
      this.prisma.aiUsage.count({ where: { createdAt: { gte: dayStart }, ok: true } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { ownedProjects: { some: {} } } }),
      this.prisma.httpMetricRollup.findMany({
        where: { minuteStart: { gte: hourAgo } },
        orderBy: { minuteStart: 'asc' },
      }),
      this.prisma.cronJobRun.findMany(),
      this.storage.estimateStorageBytes(),
    ]);

    const requestCount = rollups.reduce((sum, row) => sum + row.count, 0);
    const errorCount = rollups.reduce((sum, row) => sum + row.errorCount, 0);
    const latencySum = rollups.reduce((sum, row) => sum + row.latencySum, 0);

    return {
      counts: { users, activeUsers, projects, tasks, boards, openTickets, aiToday },
      signupFunnel: { registered, verified, withProject },
      http: {
        requestsLastHour: requestCount,
        errorRate: requestCount ? errorCount / requestCount : 0,
        avgLatencyMs: requestCount ? Math.round(latencySum / requestCount) : 0,
      },
      storage,
      crons,
      integrations: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        firebase: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_CLIENT_EMAIL),
        emailjs: Boolean(process.env.EMAILJS_SERVICE_ID),
        supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      settings: this.settings.getCached(),
      monthStart: monthStart.toISOString(),
    };
  }

  async patchSettings(
    actor: AuthUser,
    dto: {
      maintenanceMode?: boolean;
      broadcastBanner?: string | null;
      aiEnabled?: boolean;
      defaultAiDailyQuota?: number;
      registrationsEnabled?: boolean;
      fcmEnabled?: boolean;
      whiteboardRealtimeEnabled?: boolean;
    },
  ) {
    const updated = await this.prisma.systemSettings.update({
      where: { id: 'default' },
      data: dto,
    });
    await this.settings.refresh();
    await this.audit.record(actor.id, 'SETTINGS_UPDATE', 'SystemSettings', 'default', dto);
    return updated;
  }

  async listUsers(q?: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * limit;
    const where = q?.trim()
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
            { id: q },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          isArchived: true,
          isDemo: true,
          createdAt: true,
          lastActiveAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: data.map((user) => ({ ...user, status: accountStatus(user) })),
      total,
      page,
      limit,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        isArchived: true,
        isDemo: true,
        createdAt: true,
        lastActiveAt: true,
        avatarUrl: true,
        deviceTokens: {
          select: { id: true, platform: true, lastSeenAt: true, isActive: true },
        },
        otps: {
          select: { purpose: true, expiresAt: true },
          orderBy: { expiresAt: 'desc' },
          take: 3,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const [projectCount, taskCount, boardCount] = await Promise.all([
      this.prisma.projectMember.count({ where: { userId: id } }),
      this.prisma.task.count({
        where: { OR: [{ assigneeId: id }, { assignments: { some: { userId: id } } }] },
      }),
      this.prisma.whiteboardMember.count({ where: { userId: id } }),
    ]);
    return {
      ...user,
      status: accountStatus(user),
      projectCount,
      taskCount,
      boardCount,
      deviceTokens: user.deviceTokens,
      pendingOtps: user.otps.map((otp) => ({
        purpose: otp.purpose,
        expiresAt: otp.expiresAt,
      })),
    };
  }

  async suspend(actor: AuthUser, id: string) {
    const target = await this.requireUser(id);
    await this.ensureNotLastAdmin(target);
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false, tokensValidAfter: new Date() },
    });
    await this.audit.record(actor.id, 'USER_SUSPEND', 'User', id);
    return { message: 'Account suspended' };
  }

  async reinstate(actor: AuthUser, id: string) {
    await this.requireUser(id);
    await this.prisma.user.update({
      where: { id },
      data: { isActive: true, isArchived: false },
    });
    await this.audit.record(actor.id, 'USER_REINSTATE', 'User', id);
    return { message: 'Account reinstated' };
  }

  async verifyOtp(actor: AuthUser, id: string) {
    const target = await this.requireUser(id);
    await this.prisma.otp.deleteMany({ where: { userId: id } });
    await this.prisma.user.update({
      where: { id },
      data: { isActive: true, isArchived: false },
    });
    await this.audit.record(actor.id, 'USER_OTP_OVERRIDE', 'User', id, {
      email: target.email,
    });
    return { message: 'Account verified' };
  }

  async resetDemo(actor: AuthUser, id: string) {
    const target = await this.requireUser(id);
    if (!target.isDemo) throw new BadRequestException('Not a demo account');
    await this.demo.resetWorkspace();
    await this.audit.record(actor.id, 'DEMO_RESET', 'User', id);
    return { message: 'Demo workspace reset' };
  }

  async promote(actor: AuthUser, id: string) {
    const target = await this.requireUser(id);
    if (target.isDemo) throw new BadRequestException('Demo cannot be Super Admin');
    await this.prisma.user.update({
      where: { id },
      data: { role: UserRole.SUPER_ADMIN },
    });
    await this.audit.record(actor.id, 'USER_PROMOTE', 'User', id);
    return { message: 'Promoted to Super Admin' };
  }

  async demote(actor: AuthUser, id: string) {
    const target = await this.requireUser(id);
    await this.ensureNotLastAdmin(target);
    await this.prisma.user.update({
      where: { id },
      data: { role: UserRole.USER },
    });
    await this.audit.record(actor.id, 'USER_DEMOTE', 'User', id);
    return { message: 'Demoted to USER' };
  }

  async revokeTokens(actor: AuthUser, id: string) {
    await this.requireUser(id);
    await this.prisma.user.update({
      where: { id },
      data: { tokensValidAfter: new Date() },
    });
    await this.audit.record(actor.id, 'USER_REVOKE_TOKENS', 'User', id);
    return { message: 'All sessions revoked' };
  }

  async demoOverview() {
    const dayStart = startOfDay(new Date());
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const [today, week, live, summaries, blocked] = await Promise.all([
      this.prisma.demoSession.count({ where: { startedAt: { gte: dayStart } } }),
      this.prisma.demoSession.findMany({
        where: { startedAt: { gte: weekStart } },
        select: { visitorHash: true, mutationCount: true, blockedCount: true },
      }),
      this.prisma.demoSession.count({ where: { endedAt: null } }),
      this.prisma.demoDaySummary.findMany({
        orderBy: { day: 'desc' },
        take: 14,
      }),
      this.prisma.demoEvent.groupBy({
        by: ['action'],
        where: { ok: false, createdAt: { gte: weekStart } },
        _count: { action: true },
      }),
    ]);
    return {
      sessionsToday: today,
      sessionsWeek: week.length,
      uniqueVisitorsWeek: new Set(week.map((row) => row.visitorHash).filter(Boolean)).size,
      liveSessions: live,
      summaries,
      blockedActions: blocked.map((row) => ({
        action: row.action,
        count: row._count.action,
      })),
    };
  }

  async demoSessions(page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.demoSession.findMany({
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.demoSession.count(),
    ]);
    return { data, total, page, limit };
  }

  async listTickets(filters: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    category?: SupportTicketCategory;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          attachments: true,
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        attachments: true,
        replies: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async patchTicket(
    actor: AuthUser,
    id: string,
    dto: { status?: SupportTicketStatus; priority?: SupportTicketPriority },
  ) {
    await this.getTicket(id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: dto,
    });
    await this.audit.record(actor.id, 'TICKET_UPDATE', 'SupportTicket', id, dto);
    return updated;
  }

  async replyTicket(
    actor: AuthUser,
    id: string,
    body: string,
    resolve?: boolean,
  ) {
    const ticket = await this.getTicket(id);
    await this.email.sendHtml(
      ticket.user.email,
      `Re: ${ticket.title}`,
      `<p>${escapeHtml(body)}</p>`,
    );
    const reply = await this.prisma.supportReply.create({
      data: {
        ticketId: id,
        authorId: actor.id,
        channel: SupportReplyChannel.EMAIL,
        body,
      },
    });
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: resolve
          ? SupportTicketStatus.RESOLVED
          : SupportTicketStatus.AWAITING_USER,
      },
    });
    await this.audit.record(actor.id, 'TICKET_REPLY', 'SupportTicket', id, {
      resolve: Boolean(resolve),
    });
    return reply;
  }

  async listBroadcasts() {
    const rows = await this.prisma.adminBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(
      rows.map(async (row) => {
        const opened = await this.prisma.notification.count({
          where: { broadcastId: row.id, openedAt: { not: null } },
        });
        const sent = await this.prisma.notification.count({
          where: { broadcastId: row.id },
        });
        return { ...row, openedCount: opened, tapRate: sent ? opened / sent : 0 };
      }),
    );
  }

  async sendBroadcast(
    actor: AuthUser,
    dto: {
      scope: AdminBroadcastScope;
      targetUserId?: string;
      targetProjectId?: string;
      title: string;
      body: string;
      actionUrl?: string;
      inApp?: boolean;
      fcm?: boolean;
      email?: boolean;
    },
  ) {
    const userIds = await this.resolveBroadcastTargets(dto);
    const broadcast = await this.prisma.adminBroadcast.create({
      data: {
        createdById: actor.id,
        scope: dto.scope,
        targetUserId: dto.targetUserId,
        targetProjectId: dto.targetProjectId,
        title: dto.title,
        body: dto.body,
        actionUrl: dto.actionUrl,
        inApp: dto.inApp ?? true,
        fcm: dto.fcm ?? false,
        email: dto.email ?? false,
      },
    });
    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        if (dto.inApp !== false) {
          await this.notifications.createNotification(
            userId,
            'ADMIN_BROADCAST',
            dto.title,
            dto.body,
            { url: dto.actionUrl, broadcastId: broadcast.id },
            broadcast.id,
            dto.fcm === false,
          );
        }
        if (dto.email) {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          });
          if (user?.email) {
            await this.email.sendHtml(user.email, dto.title, `<p>${escapeHtml(dto.body)}</p>`);
          }
        }
        await this.prisma.adminBroadcastDelivery.create({
          data: { broadcastId: broadcast.id, userId, channel: 'in-app', ok: true },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.adminBroadcastDelivery.create({
          data: {
            broadcastId: broadcast.id,
            userId,
            channel: 'in-app',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    const updated = await this.prisma.adminBroadcast.update({
      where: { id: broadcast.id },
      data: { sentCount: sent, failedCount: failed },
    });
    await this.audit.record(actor.id, 'BROADCAST_SEND', 'AdminBroadcast', broadcast.id, {
      sent,
      failed,
      recipients: userIds.length,
    });
    return updated;
  }

  async aiUsage() {
    const dayStart = startOfDay(new Date());
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const [today, month, byUser, quotas] = await Promise.all([
      this.prisma.aiUsage.count({ where: { createdAt: { gte: dayStart } } }),
      this.prisma.aiUsage.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.aiUsage.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: monthStart } },
        _count: { userId: true },
      }),
      this.prisma.aiUserQuota.findMany(),
    ]);
    return {
      today,
      month,
      byUser,
      quotas,
      settings: this.settings.getCached(),
    };
  }

  async setAiQuota(actor: AuthUser, userId: string, dailyLimit: number) {
    await this.requireUser(userId);
    const row = await this.prisma.aiUserQuota.upsert({
      where: { userId },
      create: { userId, dailyLimit },
      update: { dailyLimit },
    });
    await this.audit.record(actor.id, 'AI_QUOTA_UPDATE', 'User', userId, { dailyLimit });
    return row;
  }

  async listAudit(filters: { action?: string; page?: number; limit?: number }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 30;
    const where = filters.action ? { action: filters.action } : {};
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  private async resolveBroadcastTargets(dto: {
    scope: AdminBroadcastScope;
    targetUserId?: string;
    targetProjectId?: string;
  }) {
    if (dto.scope === AdminBroadcastScope.USER) {
      if (!dto.targetUserId) throw new BadRequestException('targetUserId required');
      return [dto.targetUserId];
    }
    if (dto.scope === AdminBroadcastScope.PROJECT) {
      if (!dto.targetProjectId) throw new BadRequestException('targetProjectId required');
      const members = await this.prisma.projectMember.findMany({
        where: { projectId: dto.targetProjectId },
        select: { userId: true },
      });
      return members.map((row) => row.userId);
    }
    const users = await this.prisma.user.findMany({
      where: { isActive: true, isArchived: false, isDemo: false },
      select: { id: true },
    });
    return users.map((row) => row.id);
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureNotLastAdmin(target: { id: string; role: UserRole }) {
    if (target.role !== UserRole.SUPER_ADMIN) return;
    const remaining = await this.prisma.user.count({
      where: {
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        isArchived: false,
        isDemo: false,
        id: { not: target.id },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException('Cannot remove the last Super Admin');
    }
  }
}

function accountStatus(user: {
  isDemo: boolean;
  isActive: boolean;
  isArchived: boolean;
}) {
  if (user.isDemo) return 'DEMO';
  if (!user.isActive || user.isArchived) return 'SUSPENDED';
  return 'ACTIVE';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
