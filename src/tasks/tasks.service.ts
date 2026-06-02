import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const STATUS_MESSAGES: Record<string, string> = {
  'To Do': 'Moved back to To Do',
  'In Progress': 'Moved to In Progress',
  'In Review': 'Submitted for review',
  'Completed': 'Marked as Completed',
};

const ASSIGNEE_SELECT = { id: true, fullName: true, avatarUrl: true, roleTitle: true };

const ACTIVITY_USER_SELECT = { id: true, fullName: true, avatarUrl: true, roleTitle: true };

const TASK_INCLUDE = {
  subtasks: true,
  assignee: { select: ASSIGNEE_SELECT },
  taskActivities: {
    orderBy: { createdAt: 'desc' as const },
    include: { createdBy: { select: ACTIVITY_USER_SELECT } },
  },
};

interface ActivityInput {
  type: string;
  content: string;
  createdById?: string | null;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto) {
    const activities: ActivityInput[] = [
      { type: 'CREATED', content: 'Task created', createdById: userId },
    ];

    const assigneeId = dto.assigneeId ?? userId;

    if (assigneeId) {
      const name = await this.resolveUserName(assigneeId);
      activities.push({
        type: 'ASSIGNEE_CHANGE',
        content: `Assigned to ${name}`,
        createdById: userId,
      });
    }

    const task = await (this.prisma as any).task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ?? 'To Do',
        priority: dto.priority ?? 'Medium',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId: dto.projectId,
        assigneeId,
        ...(dto.subtasks?.length
          ? {
              subtasks: {
                create: dto.subtasks.map((s) => ({
                  title: s.title,
                  isCompleted: false,
                })),
              },
            }
          : {}),
        taskActivities: { create: activities },
      },
      include: TASK_INCLUDE,
    });

    return this.formatTask(task);
  }

  // ─── List by project ──────────────────────────────────────────────────────

  async findByProject(projectId: string) {
    const tasks = await (this.prisma as any).task.findMany({
      where: { projectId },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((task: any) => this.formatTask(task));
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const task = await (this.prisma as any).task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    const activityLogs = await this.buildUpdateActivities(userId, task, dto);

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.completedAt !== undefined) data.completedAt = new Date(dto.completedAt);

    if (dto.status === 'Completed' && task.status !== 'Completed' && dto.completedAt === undefined) {
      data.completedAt = new Date();
    }

    const updated = await (this.prisma as any).task.update({
      where: { id },
      data: {
        ...data,
        ...(activityLogs.length
          ? {
              taskActivities: {
                create: activityLogs.map((log) => ({
                  type: log.type,
                  content: log.content,
                  createdById: log.createdById ?? userId,
                })),
              },
            }
          : {}),
      },
      include: TASK_INCLUDE,
    });

    return this.formatTask(updated);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string) {
    const task = await (this.prisma as any).task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    await (this.prisma as any).task.delete({ where: { id } });
    return { message: 'Task deleted successfully' };
  }

  // ─── Activity logging ─────────────────────────────────────────────────────

  private async buildUpdateActivities(
    userId: string,
    before: any,
    dto: UpdateTaskDto,
  ): Promise<ActivityInput[]> {
    const logs: ActivityInput[] = [];

    if (dto.status !== undefined && dto.status !== before.status) {
      logs.push({
        type: 'STATUS_CHANGE',
        content: STATUS_MESSAGES[dto.status] ?? `Status changed to ${dto.status}`,
        createdById: userId,
      });
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== before.assigneeId) {
      if (dto.assigneeId === null) {
        logs.push({
          type: 'ASSIGNEE_CHANGE',
          content: 'Task unassigned',
          createdById: userId,
        });
      } else {
        const name = await this.resolveUserName(dto.assigneeId);
        logs.push({
          type: 'ASSIGNEE_CHANGE',
          content:
            before.assigneeId == null
              ? `Assigned to ${name}`
              : `Reassigned to ${name}`,
          createdById: userId,
        });
      }
    }

    if (dto.priority !== undefined && dto.priority !== before.priority) {
      logs.push({
        type: 'PRIORITY_CHANGE',
        content: `Priority changed to ${dto.priority}`,
        createdById: userId,
      });
    }

    if (dto.title !== undefined && dto.title !== before.title) {
      logs.push({
        type: 'TITLE_CHANGE',
        content: `Title updated to "${dto.title}"`,
        createdById: userId,
      });
    }

    if (dto.description !== undefined && dto.description !== before.description) {
      logs.push({
        type: 'DESCRIPTION_CHANGE',
        content: 'Description updated',
        createdById: userId,
      });
    }

    if (dto.dueDate !== undefined) {
      const prev = before.dueDate ? new Date(before.dueDate).toISOString().split('T')[0] : null;
      const next = new Date(dto.dueDate).toISOString().split('T')[0];
      if (prev !== next) {
        logs.push({
          type: 'DUE_DATE_CHANGE',
          content: prev ? `Due date changed from ${prev} to ${next}` : `Due date set to ${next}`,
          createdById: userId,
        });
      }
    }

    return logs;
  }

  private async resolveUserName(userId: string): Promise<string> {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? 'Unknown user';
  }

  // ─── Response shaping ─────────────────────────────────────────────────────

  private formatActivity(activity: any) {
    return {
      id: activity.id,
      type: activity.type,
      content: activity.content,
      createdAt: activity.createdAt,
      createdBy: activity.createdBy ?? null,
    };
  }

  private formatTask(task: any) {
    const activities = (task.taskActivities ?? []).map((a: any) =>
      this.formatActivity(a),
    );

    const lastActivity =
      activities[0] ??
      ({
        id: null,
        type: 'SYSTEM',
        content: 'No activity recorded yet',
        createdAt: task.updatedAt ?? task.createdAt,
        createdBy: null,
      } as const);

    const { taskActivities, ...rest } = task;

    return {
      ...rest,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      activities,
      lastActivity,
    };
  }
}
