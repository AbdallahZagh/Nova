import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const MEMBER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  roleTitle: true,
};

/** Task shape needed to compute project progress (tasks + subtasks). */
const TASK_PROGRESS_SELECT = {
  id: true,
  status: true,
  subtasks: { select: { isCompleted: true } },
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreateProjectDto) {
    const project = await (this.prisma as any).project.create({
      data: { ...dto, ownerId },
      include: {
        owner: { select: MEMBER_SELECT },
        tasks: { select: TASK_PROGRESS_SELECT },
      },
    });

    return this.withCompletion(project);
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async findAll(userId: string) {
    const projects = await (this.prisma as any).project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        owner: { select: MEMBER_SELECT },
        members: {
          include: { user: { select: MEMBER_SELECT } },
        },
        tasks: { select: TASK_PROGRESS_SELECT },
      },
      orderBy: { name: 'asc' },
    });

    return projects.map((project: any) => this.withCompletion(project));
  }

  // ─── Detail ───────────────────────────────────────────────────────────────

  async findOne(userId: string, id: string) {
    const project = await (this.prisma as any).project.findUnique({
      where: { id },
      include: {
        owner: { select: MEMBER_SELECT },
        members: {
          include: { user: { select: MEMBER_SELECT } },
        },
        tasks: {
          include: {
            subtasks: true,
            assignee: { select: { id: true, fullName: true, avatarUrl: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = project.members.some((m: any) => m.userId === userId);
    if (project.ownerId !== userId && !isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return this.withCompletion(project);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const project = await (this.prisma as any).project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can update this project');
    }

    const updated = await (this.prisma as any).project.update({
      where: { id },
      data: dto,
      include: {
        owner: { select: MEMBER_SELECT },
        members: {
          include: { user: { select: MEMBER_SELECT } },
        },
        tasks: { select: TASK_PROGRESS_SELECT },
      },
    });

    return this.withCompletion(updated);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(userId: string, id: string) {
    const project = await (this.prisma as any).project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can delete this project');
    }

    await (this.prisma as any).project.delete({ where: { id } });
    return { message: 'Project deleted successfully' };
  }

  // ─── Progress helpers ─────────────────────────────────────────────────────

  /**
   * Progress is driven by subtasks when any exist; otherwise by completed tasks.
   * Matches dashboard productivity logic at the project level.
   */
  private computeProgress(tasks: any[]) {
    let totalTasks = tasks.length;
    let completedTasks = 0;
    let totalSubtasks = 0;
    let completedSubtasks = 0;

    for (const task of tasks) {
      if (task.status === 'Completed') completedTasks++;

      const subs: any[] = task.subtasks ?? [];
      totalSubtasks += subs.length;
      completedSubtasks += subs.filter((s) => s.isCompleted).length;
    }

    let completionPercentage = 0;
    if (totalSubtasks > 0) {
      completionPercentage = Math.round((completedSubtasks / totalSubtasks) * 100);
    } else if (totalTasks > 0) {
      completionPercentage = Math.round((completedTasks / totalTasks) * 100);
    }

    return {
      totalTasks,
      completedTasks,
      totalSubtasks,
      completedSubtasks,
      completionPercentage,
    };
  }

  private withCompletion(project: any) {
    const tasks: any[] = project.tasks ?? [];
    const progress = this.computeProgress(tasks);

    return {
      ...project,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...progress,
    };
  }
}
