import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuperAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) return;

    const superAdminCount = await this.prisma.user.count({
      where: { role: UserRole.SUPER_ADMIN },
    });
    if (superAdminCount !== 0) return;

    const result = await this.prisma.user.updateMany({
      where: { email, role: UserRole.USER, isDemo: false },
      data: { role: UserRole.SUPER_ADMIN },
    });

    if (result.count > 0) {
      this.logger.log(`Promoted ${email} to SUPER_ADMIN`);
    } else {
      this.logger.warn(
        `SUPER_ADMIN_EMAIL=${email} did not match an eligible USER account`,
      );
    }
  }
}
