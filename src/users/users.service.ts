import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    const [projectsCount, tasksCount] = await Promise.all([
      (this.prisma as any).project.count({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      }),
      (this.prisma as any).task.count({
        where: { assigneeId: userId },
      }),
    ]);

    const { passwordHash, ...profile } = user;
    return { ...profile, projectsCount, tasksCount };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    const updated = await (this.prisma as any).user.update({
      where: { id: userId },
      data: dto,
    });

    const { passwordHash, ...profile } = updated;
    return profile;
  }
}
