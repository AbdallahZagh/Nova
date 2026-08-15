import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProjectRole,
  REQUIRED_PROJECT_ROLES_KEY,
} from '../decorators/require-project-role.decorator';

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowedRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      REQUIRED_PROJECT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles?.length) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: Record<string, string | undefined>;
      body?: Record<string, unknown>;
    }>();
    const userId = request.user?.id;

    if (!userId) throw new ForbiddenException('Missing authenticated user');

    const projectId = await this.resolveProjectId(request.params, request.body);
    if (!projectId) throw new ForbiddenException('Project context is required');

    const membership = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('You do not have the required project role');
    }

    return true;
  }

  private async resolveProjectId(
    params: Record<string, string | undefined>,
    body?: Record<string, unknown>,
  ): Promise<string | null> {
    if (params.projectId) return params.projectId;

    if (params.taskId) {
      const task = await (this.prisma as any).task.findUnique({
        where: { id: params.taskId },
        select: { projectId: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      return task.projectId;
    }

    if (params.id) {
      const project = await (this.prisma as any).project.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (project) return project.id;

      const task = await (this.prisma as any).task.findUnique({
        where: { id: params.id },
        select: { projectId: true },
      });
      if (task) return task.projectId;

      const subtask = await (this.prisma as any).subtask.findUnique({
        where: { id: params.id },
        select: { task: { select: { projectId: true } } },
      });
      if (subtask) return subtask.task.projectId;

      const taskComment = await (this.prisma as any).taskComment.findUnique({
        where: { id: params.id },
        select: { task: { select: { projectId: true } } },
      });
      if (taskComment) return taskComment.task.projectId;

      const whiteboard = await (this.prisma as any).whiteboard.findUnique({
        where: { id: params.id },
        select: { projectId: true },
      });
      if (whiteboard?.projectId) return whiteboard.projectId;

      const suggestion = await (this.prisma as any).projectSuggestion.findUnique({
        where: { id: params.id },
        select: { projectId: true },
      });
      if (suggestion) return suggestion.projectId;

      throw new NotFoundException('Project resource not found');
    }

    const bodyProjectId = body?.projectId;
    if (typeof bodyProjectId === 'string') return bodyProjectId;

    const bodyTaskId = body?.taskId;
    if (typeof bodyTaskId === 'string') {
      const task = await (this.prisma as any).task.findUnique({
        where: { id: bodyTaskId },
        select: { projectId: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      return task.projectId;
    }

    return null;
  }
}
