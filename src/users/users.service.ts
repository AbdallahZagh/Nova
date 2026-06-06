import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeUsername } from '../common/utils/username.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const USER_SEARCH_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(query?: string) {
    const q = query?.trim();

    return (this.prisma as any).user.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      select: USER_SEARCH_SELECT,
      take: 10,
      orderBy: { fullName: 'asc' },
    });
  }

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
        where: {
          OR: [
            { assigneeId: userId },
            { assignments: { some: { userId } } },
          ],
        },
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

    const { username: rawUsername, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (rawUsername !== undefined) {
      const username = normalizeUsername(rawUsername);
      if (username !== user.username) {
        const taken = await (this.prisma as any).user.findUnique({
          where: { username },
        });
        if (taken) {
          throw new ConflictException('This username is already taken');
        }
        data.username = username;
      }
    }

    await (this.prisma as any).user.update({
      where: { id: userId },
      data,
    });

    // Delegate to getProfile so the response always includes projectsCount and tasksCount
    return this.getProfile(userId);
  }
}
