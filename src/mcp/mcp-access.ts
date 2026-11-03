import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Any project member, including viewers, can read. */
export const READ_ROLES: ProjectRole[] = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
];

/** Matches task, subtask, and comment create routes. */
export const TASK_WRITE_ROLES: ProjectRole[] = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
];

/** Matches project update and member management routes. */
export const PROJECT_MANAGE_ROLES: ProjectRole[] = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
];

/** Matches project delete. */
export const PROJECT_OWNER_ROLES: ProjectRole[] = [ProjectRole.OWNER];

/** Matches comment reply and close. */
export const COMMENT_MODERATE_ROLES: ProjectRole[] = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
];

type ProjectRef = { id: string };
type TaskRef = { projectId: string };
type NestedProjectRef = { task: { projectId: string } };
type MembershipRef = { role: ProjectRole };

interface AccessDb {
  project: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<ProjectRef | null>;
  };
  task: {
    findUnique(args: {
      where: { id: string };
      select: { projectId: true };
    }): Promise<TaskRef | null>;
  };
  subtask: {
    findUnique(args: {
      where: { id: string };
      select: { task: { select: { projectId: true } } };
    }): Promise<NestedProjectRef | null>;
  };
  taskComment: {
    findUnique(args: {
      where: { id: string };
      select: { task: { select: { projectId: true } } };
    }): Promise<NestedProjectRef | null>;
  };
  projectMember: {
    findUnique(args: {
      where: { userId_projectId: { userId: string; projectId: string } };
      select: { role: true };
    }): Promise<MembershipRef | null>;
  };
}

/**
 * Membership checks for MCP tools.
 * Several task and subtask service methods do not check the caller, because
 * the HTTP controllers rely on ProjectRoleGuard. Tools must not skip that.
 */
@Injectable()
export class McpAccessService {
  private readonly db: AccessDb;

  constructor(prisma: PrismaService) {
    this.db = prisma as unknown as AccessDb;
  }

  async assertProject(
    userId: string,
    projectId: string,
    allowed: ProjectRole[],
  ) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.assertMembership(userId, projectId, allowed);
  }

  async assertTask(userId: string, taskId: string, allowed: ProjectRole[]) {
    const task = await this.db.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.assertMembership(userId, task.projectId, allowed);
  }

  async assertTasks(userId: string, taskIds: string[], allowed: ProjectRole[]) {
    for (const taskId of taskIds) {
      await this.assertTask(userId, taskId, allowed);
    }
  }

  async assertSubtask(
    userId: string,
    subtaskId: string,
    allowed: ProjectRole[],
  ) {
    const subtask = await this.db.subtask.findUnique({
      where: { id: subtaskId },
      select: { task: { select: { projectId: true } } },
    });
    if (!subtask) throw new NotFoundException('Subtask not found');
    return this.assertMembership(userId, subtask.task.projectId, allowed);
  }

  async assertSubtasks(
    userId: string,
    subtaskIds: string[],
    allowed: ProjectRole[],
  ) {
    for (const subtaskId of subtaskIds) {
      await this.assertSubtask(userId, subtaskId, allowed);
    }
  }

  async assertComment(
    userId: string,
    commentId: string,
    allowed: ProjectRole[],
  ) {
    const comment = await this.db.taskComment.findUnique({
      where: { id: commentId },
      select: { task: { select: { projectId: true } } },
    });
    if (!comment) throw new NotFoundException('Task comment not found');
    return this.assertMembership(userId, comment.task.projectId, allowed);
  }

  private async assertMembership(
    userId: string,
    projectId: string,
    allowed: ProjectRole[],
  ) {
    const membership = await this.db.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { role: true },
    });

    if (!membership || !allowed.includes(membership.role)) {
      throw new ForbiddenException('You do not have the required project role');
    }

    return membership;
  }
}
