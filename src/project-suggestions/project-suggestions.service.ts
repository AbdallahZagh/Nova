import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectSuggestionDto,
  ProjectSuggestionStatus,
} from './dto/create-project-suggestion.dto';
import { UpdateProjectSuggestionDto } from './dto/update-project-suggestion.dto';

const CREATED_BY_SELECT = {
  id: true,
  fullName: true,
  email: true,
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
  ) {}

  async create(userId: string, dto: CreateProjectSuggestionDto) {
    const project = await this.ensureProjectAccess(userId, dto.projectId);

    const suggestion = await (this.prisma as any).projectSuggestion.create({
      data: {
        content: dto.content,
        status: dto.status ?? ProjectSuggestionStatus.IN_REVIEW,
        projectId: dto.projectId,
        createdById: userId,
      },
      include: SUGGESTION_INCLUDE,
    });

    await this.notificationsService.notifyProjectManagers(
      dto.projectId,
      'PROJECT_SUGGESTION_CREATED',
      'New project suggestion',
      `A new suggestion was added to ${project.name}.`,
      { suggestionId: suggestion.id, createdById: userId },
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
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await (this.prisma as any).projectSuggestion.update({
      where: { id },
      data,
      include: SUGGESTION_INCLUDE,
    });

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
}
