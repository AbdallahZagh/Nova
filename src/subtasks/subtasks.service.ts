import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignSubtasksDto,
  SubtaskAssignmentInputDto,
} from './dto/assign-subtasks.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

const ASSIGNEE_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  roleTitle: true,
};

const ASSIGNABLE_PROJECT_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
];

const SUBTASK_INCLUDE = {
  assignments: {
    include: { user: { select: ASSIGNEE_SELECT } },
    orderBy: { assignedAt: 'asc' as const },
  },
};

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateSubtaskDto) {
    const subtask = await (this.prisma as any).subtask.create({
      data: {
        title: dto.title,
        isCompleted: false,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        taskId: dto.taskId,
      },
      include: SUBTASK_INCLUDE,
    });

    return this.formatSubtask(subtask);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSubtaskDto) {
    const before = await this.findOneOrFail(id);

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.isCompleted !== undefined) data.isCompleted = dto.isCompleted;
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);

    const subtask = await (this.prisma as any).subtask.update({
      where: { id },
      data,
      include: SUBTASK_INCLUDE,
    });

    if (
      dto.title !== undefined ||
      dto.isCompleted !== undefined ||
      dto.dueDate !== undefined
    ) {
      await this.notificationsService.notifySubtaskUpdated(
        subtask.id,
        subtask.title,
      );
    }

    if (dto.isCompleted === true && before.isCompleted !== true) {
      await this.notificationsService.notifySubtaskDone(
        subtask.id,
        subtask.title,
      );
    }

    return this.formatSubtask(subtask);
  }

  async assignSubtasks(actorId: string, dto: AssignSubtasksDto) {
    const assignments = dto.assignments?.length
      ? dto.assignments
      : [{ userId: dto.userId!, subtaskIds: dto.subtaskIds! }];

    this.ensureNoDuplicateSubtaskAssignmentPairs(assignments);

    const subtaskIds = [
      ...new Set(assignments.flatMap((assignment) => assignment.subtaskIds)),
    ];
    const subtasks = await (this.prisma as any).subtask.findMany({
      where: { id: { in: subtaskIds } },
      select: {
        id: true,
        title: true,
        task: { select: { id: true, projectId: true } },
      },
    });
    const subtasksById = new Map(
      subtasks.map((subtask: any) => [subtask.id, subtask]),
    );

    for (const subtaskId of subtaskIds) {
      if (!subtasksById.has(subtaskId)) {
        throw new NotFoundException(`Subtask not found: ${subtaskId}`);
      }
    }

    for (const assignment of assignments) {
      for (const subtaskId of assignment.subtaskIds) {
        const subtask = subtasksById.get(subtaskId);
        await this.ensureActorCanAssignSubtasks(
          subtask.task.projectId,
          actorId,
        );
        await this.ensureAssignableProjectMember(
          subtask.task.projectId,
          assignment.userId,
        );
      }
    }

    const updatedSubtasks: any[] = [];

    for (const assignment of assignments) {
      for (const subtaskId of assignment.subtaskIds) {
        const updated = await (this.prisma as any).subtask.update({
          where: { id: subtaskId },
          data: {
            assignments: {
              upsert: {
                where: {
                  subtaskId_userId: {
                    subtaskId,
                    userId: assignment.userId,
                  },
                },
                update: {},
                create: { userId: assignment.userId },
              },
            },
          },
          include: SUBTASK_INCLUDE,
        });

        updatedSubtasks.push(this.formatSubtask(updated));
        await this.notificationsService.notifySubtaskAssigned(
          assignment.userId,
          subtaskId,
          updated.title,
        );
      }
    }

    return {
      message: 'Subtask assignments saved successfully',
      count: updatedSubtasks.length,
      data: updatedSubtasks,
    };
  }

  async unassignSubtask(actorId: string, subtaskId: string, userId: string) {
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      select: { id: true, title: true, task: { select: { projectId: true } } },
    });
    if (!subtask) throw new NotFoundException('Subtask not found');

    await this.ensureActorCanAssignSubtasks(subtask.task.projectId, actorId);

    const assignment = await (this.prisma as any).subtaskAssignment.findUnique({
      where: { subtaskId_userId: { subtaskId, userId } },
    });
    if (!assignment)
      throw new NotFoundException('Subtask assignment not found');

    await (this.prisma as any).subtaskAssignment.delete({
      where: { subtaskId_userId: { subtaskId, userId } },
    });

    const updated = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      include: SUBTASK_INCLUDE,
    });

    await this.notificationsService.notifySubtaskUnassigned(
      userId,
      subtaskId,
      subtask.title,
    );

    return {
      message: 'Subtask assignment removed successfully',
      data: this.formatSubtask(updated),
    };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string) {
    await this.findOneOrFail(id);
    await (this.prisma as any).subtask.delete({ where: { id } });
    return { message: 'Subtask deleted successfully' };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async findOneOrFail(id: string) {
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id },
    });
    if (!subtask) throw new NotFoundException('Subtask not found');
    return subtask;
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
        'Subtask assignee must be a member of this project',
      );
    }

    if (!ASSIGNABLE_PROJECT_ROLES.includes(membership.role)) {
      throw new BadRequestException('Viewers cannot be assigned subtasks');
    }
  }

  private async ensureActorCanAssignSubtasks(
    projectId: string,
    actorId: string,
  ) {
    const membership = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId: actorId, projectId } },
      select: { role: true },
    });

    if (!membership || !ASSIGNABLE_PROJECT_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'You do not have permission to assign subtasks in this project',
      );
    }
  }

  private ensureNoDuplicateSubtaskAssignmentPairs(
    assignments: SubtaskAssignmentInputDto[],
  ) {
    const seenPairs = new Set<string>();

    for (const assignment of assignments) {
      for (const subtaskId of assignment.subtaskIds) {
        const pair = `${subtaskId}:${assignment.userId}`;
        if (seenPairs.has(pair)) {
          throw new BadRequestException(
            'The same subtask cannot be assigned to the same user more than once in one request',
          );
        }

        seenPairs.add(pair);
      }
    }
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
