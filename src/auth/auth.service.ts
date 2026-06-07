import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  logout() {
    return {
      message: 'Logged out successfully.',
      action: 'CLEAR_TOKENS',
    };
  }

  /**
   * Archives the user's local record. The Supabase session must be revoked
   * separately on the client via supabase.auth.signOut().
   */
  async deactivateAccount(userId: string) {
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { isActive: false, isArchived: true },
    });

    return {
      message:
        'Your account has been deactivated. You can restore it at any time by contacting support.',
      action: 'CLEAR_TOKENS',
    };
  }
}
