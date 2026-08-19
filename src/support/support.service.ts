import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  UserRole,
} from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async createTicket(
    userId: string,
    input: {
      title: string;
      body: string;
      category?: SupportTicketCategory;
      priority?: SupportTicketPriority;
      route?: string;
      appVersion?: string;
      platform?: string;
      userAgent?: string;
      file?: Express.Multer.File;
    },
  ) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) {
      throw new BadRequestException('Title and description are required');
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        title,
        body,
        category: input.category ?? SupportTicketCategory.OTHER,
        priority: input.priority ?? SupportTicketPriority.NORMAL,
        route: input.route,
        appVersion: input.appVersion,
        platform: input.platform,
        userAgent: input.userAgent,
      },
    });
    if (input.file?.buffer) {
      const uploaded = await this.storage.uploadSupportAttachment(
        ticket.id,
        input.file.buffer,
        input.file.mimetype || 'image/png',
      );
      await this.prisma.supportAttachment.create({
        data: {
          ticketId: ticket.id,
          storagePath: uploaded.storagePath,
          imageUrl: uploaded.imageUrl,
        },
      });
    }
    if (ticket.priority === SupportTicketPriority.URGENT) {
      const admins = await this.prisma.user.findMany({
        where: {
          role: UserRole.SUPER_ADMIN,
          isActive: true,
          isArchived: false,
        },
        select: { id: true },
      });
      await this.notifications.notifyUsers(
        admins.map((row) => row.id),
        'ADMIN_SUPPORT_URGENT',
        'Urgent support ticket',
        `${title}`,
        { ticketId: ticket.id, url: `/admin/support?ticket=${ticket.id}` },
      );
    }
    return ticket;
  }
}
