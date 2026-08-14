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
  username: true,
  avatarUrl: true,
};

const PROFILE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  isActive: true,
  isArchived: true,
  roleTitle: true,
  bio: true,
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
            { username: { contains: q, mode: 'insensitive' } },
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
      select: PROFILE_USER_SELECT,
    });

    if (!user) throw new NotFoundException('User not found');

    const [projectsCount, tasksCount, projects, activity] = await Promise.all([
      (this.prisma as any).project.count({
        where: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      }),
      (this.prisma as any).task.count({
        where: this.assignedTasksWhere(userId),
      }),
      this.getUserProjects(userId),
      this.getUserActivity(userId),
    ]);

    return {
      ...user,
      projectsCount,
      tasksCount,
      activity,
      projects,
    };
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

  private async getUserProjects(userId: string) {
    const projects = await (this.prisma as any).project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        members: {
          where: { userId },
          select: { role: true },
        },
        tasks: {
          where: this.assignedTasksWhere(userId),
          select: {
            id: true,
            status: true,
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { name: 'asc' },
    });

    return projects.map((project: any) => {
      const userTasks = project.tasks ?? [];
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        role:
          project.ownerId === userId
            ? 'OWNER'
            : (project.members?.[0]?.role ?? null),
        totalTasksCount: project._count?.tasks ?? 0,
        userTasksCount: userTasks.length,
        completedUserTasksCount: userTasks.filter(
          (task: any) => task.status === 'Completed',
        ).length,
      };
    });
  }

  private async getUserActivity(userId: string) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const tasks = await (this.prisma as any).task.findMany({
      where: {
        AND: [
          this.assignedTasksWhere(userId),
          {
            OR: [
              { createdAt: { gte: oneYearAgo } },
              { dueDate: { gte: oneYearAgo } },
              { completedAt: { gte: oneYearAgo } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        project: { select: { name: true } },
        subtasks: { select: { isCompleted: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const map: Record<string, any[]> = {};

    for (const task of tasks) {
      const dateKey = this.resolveDateKey(task);
      if (!map[dateKey]) map[dateKey] = [];

      map[dateKey].push({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? this.toDateString(task.dueDate) : null,
        projectName: task.project?.name ?? null,
        completionPercentage: this.calcCompletion(task),
      });
    }

    for (const key of Object.keys(map)) {
      map[key].sort(
        (a, b) => b.completionPercentage - a.completionPercentage,
      );
    }

    return map;
  }

  private assignedTasksWhere(userId: string) {
    return {
      OR: [{ assigneeId: userId }, { assignments: { some: { userId } } }],
    };
  }

  private resolveDateKey(task: any): string {
    if (task.status === 'Completed' && task.completedAt) {
      return this.toDateString(task.completedAt);
    }
    if (task.dueDate) {
      return this.toDateString(task.dueDate);
    }
    return this.toDateString(task.createdAt);
  }

  private calcCompletion(task: any): number {
    const total: number = task.subtasks.length;
    if (total === 0) return task.status === 'Completed' ? 100 : 0;

    const done = task.subtasks.filter((s: any) => s.isCompleted).length;
    return Math.round((done / total) * 1000) / 10;
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
