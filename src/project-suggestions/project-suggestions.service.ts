import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveMentionedUsers, type MentionCandidate } from '../common/mentions';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import {
  CreateProjectSuggestionDto,
  ProjectSuggestionStatus,
} from './dto/create-project-suggestion.dto';
import { UpdateProjectSuggestionDto } from './dto/update-project-suggestion.dto';

const CREATED_BY_SELECT = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  avatarUrl: true,
  roleTitle: true,
};

const SUGGESTION_INCLUDE = {
  createdBy: { select: CREATED_BY_SELECT },
  project: { select: { id: true, name: true, ownerId: true } },
};

@Injectable()
export class ProjectSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly tasksService: TasksService,
  ) {}

  async create(userId: string, dto: CreateProjectSuggestionDto) {
    const project = await this.ensureProjectAccess(userId, dto.projectId);
    const eligible = await this.projectMentionCandidates(dto.projectId);
    const mentioned = resolveMentionedUsers(dto.content, eligible);
    const mentionedIds = mentioned.map((user) => user.id);

    const suggestion = await (this.prisma as any).projectSuggestion.create({
      data: {
        content: dto.content,
        status: dto.status ?? ProjectSuggestionStatus.IN_REVIEW,
        projectId: dto.projectId,
        createdById: userId,
        mentionedUserIds: mentionedIds,
      },
      include: SUGGESTION_INCLUDE,
    });

    const actorName = suggestion.createdBy?.fullName || 'Someone';
    try {
      await this.notificationsService.notifySuggestionMention(
        mentionedIds.filter((id) => id !== userId),
        actorName,
        project.name,
        dto.projectId,
        suggestion.id,
      );
    } catch {
      // Suggestion is saved even if the mention notification fails.
    }

    await this.notificationsService.notifyProjectManagers(
      dto.projectId,
      'PROJECT_SUGGESTION_CREATED',
      'New project suggestion',
      `A new suggestion was added to ${project.name}.`,
      { suggestionId: suggestion.id, createdById: userId, projectId: dto.projectId },
    );

    return suggestion;
  }

  async findByProject(userId: string, projectId: string) {
    await this.ensureProjectAccess(userId, projectId);

    return (this.prisma as any).projectSuggestion.findMany({
      where: { projectId },
      include: SUGGESTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const suggestion = await this.findOneOrFail(id);
    await this.ensureProjectAccess(userId, suggestion.projectId);
    return suggestion;
  }

  async update(userId: string, id: string, dto: UpdateProjectSuggestionDto) {
    const suggestion = await this.findOneOrFail(id);
    await this.ensureSuggestionMutationAllowed(userId, suggestion);

    const data: Record<string, unknown> = {};
    if (dto.content !== undefined) {
      data.content = dto.content;
      const eligible = await this.projectMentionCandidates(suggestion.projectId);
      data.mentionedUserIds = resolveMentionedUsers(dto.content, eligible).map(
        (user) => user.id,
      );
    }
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await (this.prisma as any).projectSuggestion.update({
      where: { id },
      data,
      include: SUGGESTION_INCLUDE,
    });

    if (
      dto.content !== undefined &&
      dto.content !== suggestion.content
    ) {
      const mentionedIds = Array.isArray(data.mentionedUserIds)
        ? (data.mentionedUserIds as string[])
        : [];
      try {
        await this.notificationsService.notifySuggestionMention(
          mentionedIds.filter((id) => id !== userId),
          updated.createdBy?.fullName || 'Someone',
          updated.project.name,
          updated.projectId,
          updated.id,
        );
      } catch {
        // Suggestion is saved even if the mention notification fails.
      }
    }

    if (
      dto.status !== undefined &&
      dto.status !== suggestion.status &&
      updated.createdById
    ) {
      await this.notificationsService.createNotification(
        updated.createdById,
        'PROJECT_SUGGESTION_STATUS_CHANGED',
        'Suggestion status updated',
        `Your suggestion in ${updated.project.name} was changed to ${updated.status}.`,
        {
          projectId: updated.projectId,
          suggestionId: updated.id,
          status: updated.status,
        },
      );
    }

    return updated;
  }

  async convertToTask(userId: string, id: string) {
    const suggestion = await this.findOneOrFail(id);
    await this.ensureCanCreateTasks(userId, suggestion.projectId);

    if (suggestion.status === ProjectSuggestionStatus.REJECTED) {
      throw new ForbiddenException('Rejected ideas cannot be turned into tasks');
    }

    const title = this.titleFromSuggestion(suggestion.content);
    const authorName = suggestion.createdBy?.fullName;
    const description = authorName
      ? `${suggestion.content.trim()}\n\nFrom an idea by ${authorName}.`
      : suggestion.content.trim();

    const task = await this.tasksService.create(userId, {
      title,
      description,
      projectId: suggestion.projectId,
      status: undefined,
      priority: undefined,
    });

    const updated = await (this.prisma as any).projectSuggestion.update({
      where: { id },
      data: { status: ProjectSuggestionStatus.IN_PROGRESS },
      include: SUGGESTION_INCLUDE,
    });

    if (updated.createdById && updated.createdById !== userId) {
      await this.notificationsService.createNotification(
        updated.createdById,
        'PROJECT_SUGGESTION_CONVERTED',
        'Idea turned into a task',
        `Your idea in ${updated.project.name} is now a task.`,
        {
          projectId: updated.projectId,
          suggestionId: updated.id,
          taskId: task.id,
          url: `/projects/${updated.projectId}?task=${task.id}`,
        },
      );
    }

    return { suggestion: updated, task };
  }

  async remove(userId: string, id: string) {
    const suggestion = await this.findOneOrFail(id);
    await this.ensureSuggestionMutationAllowed(userId, suggestion);

    await (this.prisma as any).projectSuggestion.delete({ where: { id } });
    return { message: 'Project suggestion deleted successfully' };
  }

  private async findOneOrFail(id: string) {
    const suggestion = await (this.prisma as any).projectSuggestion.findUnique({
      where: { id },
      include: SUGGESTION_INCLUDE,
    });

    if (!suggestion)
      throw new NotFoundException('Project suggestion not found');
    return suggestion;
  }

  private async ensureProjectAccess(userId: string, projectId: string) {
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isMember = project.members.some((m: any) => m.userId === userId);
    if (project.ownerId !== userId && !isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  private titleFromSuggestion(content: string) {
    const line = content
      .replace(/\s+/g, ' ')
      .trim()
      .split(/[.!?\n]/)[0]
      .trim();
    if (!line) return 'New task from idea';
    return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
  }

  private async ensureCanCreateTasks(userId: string, projectId: string) {
    const project = await this.ensureProjectAccess(userId, projectId);
    if (project.ownerId === userId) return project;
    const member = await (this.prisma as any).projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { role: true },
    });
    if (!member || member.role === 'VIEWER') {
      throw new ForbiddenException('Viewers cannot turn ideas into tasks');
    }
    return project;
  }

  private async ensureSuggestionMutationAllowed(
    userId: string,
    suggestion: any,
  ) {
    const project = await this.ensureProjectAccess(
      userId,
      suggestion.projectId,
    );
    if (suggestion.createdById !== userId && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the suggestion author or project owner can update this suggestion',
      );
    }
  }

  private async projectMentionCandidates(
    projectId: string,
  ): Promise<MentionCandidate[]> {
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      select: {
        owner: { select: { id: true, username: true, fullName: true } },
        members: {
          select: {
            user: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });
    if (!project) return [];
    const byId = new Map<string, MentionCandidate>();
    if (project.owner?.username) byId.set(project.owner.id, project.owner);
    for (const member of project.members) {
      if (member.user?.username) byId.set(member.user.id, member.user);
    }
    return [...byId.values()];
  }
}
