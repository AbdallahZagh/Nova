import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddProjectMemberDto,
  ProjectMemberInputDto,
} from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreateProjectDto) {
    const project = await (this.prisma as any).project.create({
      data: {
        ...dto,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: ProjectRole.OWNER,
          },
        },
      },
      include: {
        owner: { select: MEMBER_SELECT },
        members: {
          include: { user: { select: MEMBER_SELECT } },
        },
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
            subtasks: {
              include: {
                assignments: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        fullName: true,
                        email: true,
                        avatarUrl: true,
                        roleTitle: true,
                      },
                    },
                  },
                  orderBy: { assignedAt: 'asc' },
                },
              },
            },
            assignee: { select: { id: true, fullName: true, avatarUrl: true } },
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true,
                    roleTitle: true,
                  },
                },
              },
              orderBy: { assignedAt: 'asc' },
            },
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
    const project = await (this.prisma as any).project.findUnique({
      where: { id },
    });
    if (!project) throw new NotFoundException('Project not found');

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
    const project = await (this.prisma as any).project.findUnique({
      where: { id },
    });
    if (!project) throw new NotFoundException('Project not found');

    await (this.prisma as any).project.delete({ where: { id } });
    return { message: 'Project deleted successfully' };
  }

  // â”€â”€â”€ Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async addMember(
    actorId: string,
    projectId: string,
    dto: AddProjectMemberDto,
  ) {
    const project = await this.findProjectOrFail(projectId);
    const membersToAdd = dto.members?.length
      ? dto.members
      : [{ userId: dto.userId!, role: dto.role! }];

    this.ensureNoDuplicateUsers(membersToAdd);

    const createdMembers: any[] = [];

    for (const memberInput of membersToAdd) {
      const invitedUser = await this.findUserOrFail(memberInput.userId);

      const existing = await (this.prisma as any).projectMember.findUnique({
        where: { userId_projectId: { userId: memberInput.userId, projectId } },
      });
      if (existing) {
        throw new ConflictException('User is already a member of this project');
      }

      await this.ensureCanManageOwnerRole(actorId, projectId, memberInput.role);

      const member = await (this.prisma as any).projectMember.create({
        data: {
          userId: memberInput.userId,
          projectId,
          role: memberInput.role,
        },
        include: { user: { select: MEMBER_SELECT } },
      });

      await this.mailService.sendProjectInviteEmail(
        invitedUser.email,
        project.name,
        memberInput.role,
      );

      createdMembers.push(member);
    }

    return dto.members?.length ? createdMembers : createdMembers[0];
  }

  async updateMember(
    actorId: string,
    projectId: string,
    userId: string,
    dto: UpdateProjectMemberDto,
  ) {
    const member = await this.findMemberOrFail(projectId, userId);
    await this.ensureCanModifyMember(actorId, projectId, member.role, dto.role);

    return (this.prisma as any).projectMember.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role: dto.role },
      include: { user: { select: MEMBER_SELECT } },
    });
  }

  async removeMember(actorId: string, projectId: string, userId: string) {
    const member = await this.findMemberOrFail(projectId, userId);
    await this.ensureCanModifyMember(actorId, projectId, member.role);

    await (this.prisma as any).projectMember.delete({
      where: { userId_projectId: { userId, projectId } },
    });

    return { message: 'Project member removed successfully' };
  }

  // ─── Progress helpers ─────────────────────────────────────────────────────

  /**
   * Progress is driven by subtasks when any exist; otherwise by completed tasks.
   * Matches dashboard productivity logic at the project level.
   */
  private computeProgress(tasks: any[]) {
    const totalTasks = tasks.length;
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
      completionPercentage = Math.round(
        (completedSubtasks / totalSubtasks) * 100,
      );
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
    const formattedTasks = tasks.map((task) => {
      if (!task.assignments) return task;

      const assignees = task.assignments.map((assignment: any) => ({
        assignedAt: assignment.assignedAt,
        user: assignment.user,
      }));
      const subtasks = (task.subtasks ?? []).map((subtask: any) => {
        if (!subtask.assignments) return subtask;

        const subtaskAssignees = subtask.assignments.map((assignment: any) => ({
          assignedAt: assignment.assignedAt,
          user: assignment.user,
        }));
        const subtaskRest = { ...subtask };
        delete subtaskRest.assignments;
        return { ...subtaskRest, assignees: subtaskAssignees };
      });
      const rest = { ...task };
      delete rest.assignments;
      return { ...rest, subtasks, assignees };
    });

    return {
      ...project,
      tasks: formattedTasks,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...progress,
    };
  }

  private async findProjectOrFail(projectId: string) {
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async findUserOrFail(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async findMemberOrFail(projectId: string, userId: string) {
    const member = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!member) throw new NotFoundException('Project member not found');
    return member;
  }

  private ensureNoDuplicateUsers(members: ProjectMemberInputDto[]) {
    const userIds = members.map((member) => member.userId);
    const uniqueUserIds = new Set(userIds);

    if (uniqueUserIds.size !== userIds.length) {
      throw new ConflictException(
        'Duplicate users cannot be added in the same request',
      );
    }
  }

  private async ensureCanManageOwnerRole(
    actorId: string,
    projectId: string,
    targetRole: ProjectRole,
  ) {
    if (targetRole !== ProjectRole.OWNER) return;

    const actor = await this.findMemberOrFail(projectId, actorId);
    if (actor.role !== ProjectRole.OWNER) {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }
  }

  private async ensureCanModifyMember(
    actorId: string,
    projectId: string,
    currentRole: ProjectRole,
    nextRole?: ProjectRole,
  ) {
    const actor = await this.findMemberOrFail(projectId, actorId);

    if (currentRole === ProjectRole.OWNER && actor.role !== ProjectRole.OWNER) {
      throw new ForbiddenException('Admins cannot modify project owners');
    }

    if (nextRole === ProjectRole.OWNER && actor.role !== ProjectRole.OWNER) {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }
  }
}
