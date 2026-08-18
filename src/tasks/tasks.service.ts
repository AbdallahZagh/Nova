import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { DemoService } from '../demo/demo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTasksDto, TaskAssignmentInputDto } from './dto/assign-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const STATUS_MESSAGES: Record<string, string> = {
  'To Do': 'Moved back to To Do',
  'In Progress': 'Moved to In Progress',
  'In Review': 'Submitted for review',
  Completed: 'Marked as Completed',
};

const ASSIGNEE_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  roleTitle: true,
};

const ACTIVITY_USER_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  roleTitle: true,
};

const ASSIGNABLE_PROJECT_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
];

const MERGE_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'completedAt',
  'assigneeId',
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

function comparableTaskValue(field: MergeField, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (field === 'dueDate' || field === 'completedAt') {
    const time = new Date(String(value)).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return String(value);
}

const TASK_CARD_INCLUDE = {
  subtasks: {
    include: {
      assignments: {
        include: { user: { select: ASSIGNEE_SELECT } },
        orderBy: { assignedAt: 'asc' as const },
      },
    },
  },
  assignee: { select: ASSIGNEE_SELECT },
  assignments: {
    include: { user: { select: ASSIGNEE_SELECT } },
    orderBy: { assignedAt: 'asc' as const },
  },
  taskActivities: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { createdBy: { select: ACTIVITY_USER_SELECT } },
  },
};

const TASK_INCLUDE = {
  ...TASK_CARD_INCLUDE,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly demoService: DemoService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto) {
    await this.demoService.assertCanCreateTask(userId);
    const activities: ActivityInput[] = [
      { type: 'CREATED', content: 'Task created', createdById: userId },
    ];

    const assigneeId = dto.assigneeId ?? userId;

    if (assigneeId) {
      await this.ensureAssignableProjectMember(dto.projectId, assigneeId);
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
        ...(assigneeId
          ? {
              assignments: {
                create: { userId: assigneeId },
              },
            }
          : {}),
        ...(dto.subtasks?.length
          ? {
              subtasks: {
                create: dto.subtasks.map((s) => ({
                  title: s.title,
                  isCompleted: false,
                  dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
                })),
              },
            }
          : {}),
        taskActivities: { create: activities },
      },
      include: TASK_INCLUDE,
    });

    if (assigneeId) {
      await this.notificationsService.notifyTaskAssigned(
        assigneeId,
        task.id,
        task.title,
      );
    }

    return this.formatTask(task);
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const task = await (this.prisma as any).task.findUnique({
      where: { id },
      include: {
        ...TASK_INCLUDE,
        project: { select: { id: true, name: true, status: true } },
      },
    });

    if (!task) throw new NotFoundException('Task not found');

    return this.formatTask(task);
  }

  // ─── List by project ──────────────────────────────────────────────────────

  async findByProject(projectId: string) {
    const tasks = await (this.prisma as any).task.findMany({
      where: { projectId },
      include: TASK_CARD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((task: any) => this.formatTask(task));
  }

  async assignTasks(actorId: string, dto: AssignTasksDto) {
    const assignments = dto.assignments?.length
      ? dto.assignments
      : [{ userId: dto.userId!, taskIds: dto.taskIds! }];

    this.ensureNoDuplicateTaskAssignmentPairs(assignments);

    const taskIds = [
      ...new Set(assignments.flatMap((assignment) => assignment.taskIds)),
    ];
    const tasks = await (this.prisma as any).task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, title: true, projectId: true },
    });
    const tasksById = new Map(tasks.map((task: any) => [task.id, task]));

    for (const taskId of taskIds) {
      if (!tasksById.has(taskId))
        throw new NotFoundException(`Task not found: ${taskId}`);
    }

    for (const assignment of assignments) {
      for (const taskId of assignment.taskIds) {
        const task = tasksById.get(taskId);
        await this.ensureActorCanAssignTasks(task.projectId, actorId);
        await this.ensureAssignableProjectMember(
          task.projectId,
          assignment.userId,
        );
      }
    }

    const updatedTasks: any[] = [];

    for (const assignment of assignments) {
      const assigneeName = await this.resolveUserName(assignment.userId);

      for (const taskId of assignment.taskIds) {
        const updated = await (this.prisma as any).task.update({
          where: { id: taskId },
          data: {
            assigneeId: assignment.userId,
            assignments: {
              upsert: {
                where: {
                  taskId_userId: {
                    taskId,
                    userId: assignment.userId,
                  },
                },
                update: {},
                create: { userId: assignment.userId },
              },
            },
            taskActivities: {
              create: {
                type: 'ASSIGNEE_CHANGE',
                content: `Assigned to ${assigneeName}`,
                createdById: actorId,
              },
            },
          },
          include: TASK_INCLUDE,
        });

        updatedTasks.push(this.formatTask(updated));
        await this.notificationsService.notifyTaskAssigned(
          assignment.userId,
          taskId,
          updated.title,
        );
      }
    }

    return {
      message: 'Task assignments saved successfully',
      count: updatedTasks.length,
      data: updatedTasks,
    };
  }

  async unassignTask(actorId: string, taskId: string, userId: string) {
    const task = await (this.prisma as any).task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, projectId: true, assigneeId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.ensureActorCanAssignTasks(task.projectId, actorId);

    const assignment = await (this.prisma as any).taskAssignment.findUnique({
      where: { taskId_userId: { taskId, userId } },
    });
    if (!assignment) throw new NotFoundException('Task assignment not found');

    await (this.prisma as any).taskAssignment.delete({
      where: { taskId_userId: { taskId, userId } },
    });

    const nextAssignment = await (this.prisma as any).taskAssignment.findFirst({
      where: { taskId },
      orderBy: { assignedAt: 'asc' },
    });

    const updated = await (this.prisma as any).task.update({
      where: { id: taskId },
      data: {
        assigneeId:
          task.assigneeId === userId
            ? (nextAssignment?.userId ?? null)
            : task.assigneeId,
        taskActivities: {
          create: {
            type: 'ASSIGNEE_CHANGE',
            content: `Unassigned ${await this.resolveUserName(userId)}`,
            createdById: actorId,
          },
        },
      },
      include: TASK_INCLUDE,
    });

    await this.notificationsService.notifyTaskUnassigned(
      userId,
      taskId,
      updated.title,
    );

    return {
      message: 'Task assignment removed successfully',
      data: this.formatTask(updated),
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const task = await (this.prisma as any).task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    const applied: UpdateTaskDto = { ...dto };
    delete applied.base;
    const rejected: MergeField[] = [];

    if (dto.base && typeof dto.base === 'object') {
      for (const field of MERGE_FIELDS) {
        if (applied[field] === undefined) continue;
        if (!(field in dto.base)) continue;
        const expected = comparableTaskValue(field, dto.base[field]);
        const current = comparableTaskValue(field, task[field]);
        if (expected !== current) {
          rejected.push(field);
          delete applied[field];
        }
      }
    }

    if (applied.assigneeId) {
      await this.ensureAssignableProjectMember(task.projectId, applied.assigneeId);
    }

    const activityLogs = await this.buildUpdateActivities(userId, task, applied);

    const data: Record<string, any> = {};
    if (applied.title !== undefined) data.title = applied.title;
    if (applied.description !== undefined) data.description = applied.description;
    if (applied.status !== undefined) data.status = applied.status;
    if (applied.priority !== undefined) data.priority = applied.priority;
    if (applied.assigneeId !== undefined) data.assigneeId = applied.assigneeId;
    if (applied.dueDate !== undefined) data.dueDate = new Date(applied.dueDate);
    if (applied.completedAt !== undefined)
      data.completedAt = new Date(applied.completedAt);

    if (
      applied.status === 'Completed' &&
      task.status !== 'Completed' &&
      applied.completedAt === undefined
    ) {
      data.completedAt = new Date();
    }

    const hasChanges = Object.keys(data).length > 0 || activityLogs.length > 0;
    const updated = hasChanges
      ? await (this.prisma as any).task.update({
          where: { id },
          data: {
            ...data,
            ...(applied.assigneeId === null
              ? { assignments: { deleteMany: {} } }
              : applied.assigneeId
                ? {
                    assignments: {
                      upsert: {
                        where: {
                          taskId_userId: {
                            taskId: id,
                            userId: applied.assigneeId,
                          },
                        },
                        update: {},
                        create: { userId: applied.assigneeId },
                      },
                    },
                  }
                : {}),
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
        })
      : await (this.prisma as any).task.findUnique({
          where: { id },
          include: TASK_INCLUDE,
        });

    if (applied.assigneeId && applied.assigneeId !== task.assigneeId) {
      await this.notificationsService.notifyTaskAssigned(
        applied.assigneeId,
        updated.id,
        updated.title,
      );
    }

    if (applied.assigneeId === null && task.assigneeId) {
      await this.notificationsService.notifyTaskUnassigned(
        task.assigneeId,
        updated.id,
        updated.title,
      );
    }

    if (Object.keys(data).length > 0) {
      await this.notificationsService.notifyTaskUpdated(
        updated.id,
        updated.title,
      );
    }

    if (
      applied.status !== undefined &&
      applied.status !== task.status &&
      this.isDoneStatus(applied.status)
    ) {
      await this.notificationsService.notifyTaskDone(updated.id, updated.title);
    }

    let conflictBy: {
      id: string;
      fullName: string;
      username?: string | null;
    } | null = null;
    if (rejected.length) {
      const latest = await (this.prisma as any).taskActivity.findFirst({
        where: { taskId: id, createdById: { not: userId } },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, fullName: true, username: true },
          },
        },
      });
      if (latest?.createdBy) {
        conflictBy = {
          id: latest.createdBy.id,
          fullName: latest.createdBy.fullName,
          username: latest.createdBy.username ?? null,
        };
      }
    }

    return {
      ...this.formatTask(updated),
      ...(rejected.length
        ? {
            conflicts: rejected.map((field) => ({
              field,
              serverValue: updated[field] ?? task[field] ?? null,
            })),
            conflictBy,
          }
        : {}),
    };
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
        content:
          STATUS_MESSAGES[dto.status] ?? `Status changed to ${dto.status}`,
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

    if (
      dto.description !== undefined &&
      dto.description !== before.description
    ) {
      logs.push({
        type: 'DESCRIPTION_CHANGE',
        content: 'Description updated',
        createdById: userId,
      });
    }

    if (dto.dueDate !== undefined) {
      const prev = before.dueDate
        ? new Date(before.dueDate).toISOString().split('T')[0]
        : null;
      const next = new Date(dto.dueDate).toISOString().split('T')[0];
      if (prev !== next) {
        logs.push({
          type: 'DUE_DATE_CHANGE',
          content: prev
            ? `Due date changed from ${prev} to ${next}`
            : `Due date set to ${next}`,
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

  private async ensureAssignableProjectMember(
    projectId: string,
    userId: string,
  ) {
    const membership = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { role: true },
    });

    if (!membership) {
      throw new BadRequestException(
        'Task assignee must be a member of this project',
      );
    }

    if (!ASSIGNABLE_PROJECT_ROLES.includes(membership.role)) {
      throw new BadRequestException('Viewers cannot be assigned tasks');
    }
  }

  private async ensureActorCanAssignTasks(projectId: string, actorId: string) {
    const membership = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId: actorId, projectId } },
      select: { role: true },
    });

    if (!membership || !ASSIGNABLE_PROJECT_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'You do not have permission to assign tasks in this project',
      );
    }
  }

  private ensureNoDuplicateTaskAssignmentPairs(
    assignments: TaskAssignmentInputDto[],
  ) {
    const seenPairs = new Set<string>();

    for (const assignment of assignments) {
      for (const taskId of assignment.taskIds) {
        const pair = `${taskId}:${assignment.userId}`;
        if (seenPairs.has(pair)) {
          throw new BadRequestException(
            'The same task cannot be assigned to the same user more than once in one request',
          );
        }

        seenPairs.add(pair);
      }
    }
  }

  // ─── Response shaping ─────────────────────────────────────────────────────

  private isDoneStatus(status: string) {
    return status === 'DONE' || status === 'Done' || status === 'Completed';
  }

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

    const assignees = (task.assignments ?? []).map((assignment: any) => ({
      assignedAt: assignment.assignedAt,
      user: assignment.user,
    }));
    const subtasks = (task.subtasks ?? []).map((subtask: any) =>
      this.formatSubtask(subtask),
    );

    const rest = { ...task };
    delete rest.taskActivities;
    delete rest.assignments;
    delete rest.subtasks;

    return {
      ...rest,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      subtasks,
      assignees,
      activities,
      lastActivity,
    };
  }

  private formatSubtask(subtask: any) {
    const assignees = (subtask.assignments ?? []).map((assignment: any) => ({
      assignedAt: assignment.assignedAt,
      user: assignment.user,
    }));
    const rest = { ...subtask };
    delete rest.assignments;

    return { ...rest, assignees };
  }
}
