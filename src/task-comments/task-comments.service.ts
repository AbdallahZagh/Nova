import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveMentionedUsers, type MentionCandidate } from '../common/mentions';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { ReplyTaskCommentDto } from './dto/reply-task-comment.dto';

const COMMENT_USER_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  roleTitle: true,
  username: true,
};

const COMMENT_INCLUDE = {
  createdBy: { select: COMMENT_USER_SELECT },
  repliedBy: { select: COMMENT_USER_SELECT },
  closedBy: { select: COMMENT_USER_SELECT },
  task: { select: { id: true, title: true, projectId: true } },
};

@Injectable()
export class TaskCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateTaskCommentDto) {
    const task = await this.findTaskOrFail(dto.taskId);
    const eligible = await this.projectMentionCandidates(task.projectId);
    const mentioned = resolveMentionedUsers(dto.content, eligible);
    const mentionedIds = mentioned.map((user) => user.id);

    const comment = await (this.prisma as any).taskComment.create({
      data: {
        content: dto.content,
        taskId: task.id,
        createdById: userId,
        mentionedUserIds: mentionedIds,
      },
      include: COMMENT_INCLUDE,
    });

    const actorName = comment.createdBy?.fullName || 'Someone';
    await this.notificationsService.notifyTaskCommentMention(
      mentionedIds.filter((id) => id !== userId),
      actorName,
      comment.task.title,
      task.id,
      task.projectId,
      comment.id,
    );

    await this.notificationsService.notifyProjectMembers(
      task.projectId,
      'TASK_COMMENT_CREATED',
      'New task comment',
      `A new comment was added to ${comment.task.title}.`,
      { taskId: task.id, commentId: comment.id, projectId: task.projectId },
      [userId, ...mentionedIds],
    );

    return comment;
  }

  async findByTask(taskId: string) {
    await this.findTaskOrFail(taskId);

    return (this.prisma as any).taskComment.findMany({
      where: { taskId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async reply(id: string, userId: string, dto: ReplyTaskCommentDto) {
    const comment = await this.findCommentOrFail(id);
    this.ensureOpen(comment);

    const eligible = await this.projectMentionCandidates(comment.task.projectId);
    const mentioned = resolveMentionedUsers(dto.replyContent, eligible);
    const mentionedIds = mentioned.map((user) => user.id);

    const updated = await (this.prisma as any).taskComment.update({
      where: { id },
      data: {
        replyContent: dto.replyContent,
        repliedById: userId,
        repliedAt: new Date(),
        replyMentionedUserIds: mentionedIds,
      },
      include: COMMENT_INCLUDE,
    });

    const actorName = updated.repliedBy?.fullName || 'Someone';
    await this.notificationsService.notifyTaskCommentMention(
      mentionedIds.filter((mentionedId) => mentionedId !== userId),
      actorName,
      updated.task.title,
      updated.task.id,
      updated.task.projectId,
      updated.id,
    );

    if (updated.createdById && updated.createdById !== userId) {
      await this.notificationsService.notifyTaskCommentReply(
        updated.createdById,
        updated.id,
        updated.task.title,
      );
    }

    return updated;
  }

  async close(id: string, userId: string) {
    const comment = await this.findCommentOrFail(id);
    this.ensureOpen(comment);

    const updated = await (this.prisma as any).taskComment.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: userId,
        closedAt: new Date(),
      },
      include: COMMENT_INCLUDE,
    });

    if (updated.createdById) {
      await this.notificationsService.notifyTaskCommentStatusChanged(
        updated.createdById,
        updated.id,
        updated.task.title,
        updated.status,
      );
    }

    return updated;
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
    if (project.owner) byId.set(project.owner.id, project.owner);
    for (const member of project.members) {
      if (member.user) byId.set(member.user.id, member.user);
    }
    return [...byId.values()];
  }

  private async findTaskOrFail(taskId: string) {
    const task = await (this.prisma as any).task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async findCommentOrFail(id: string) {
    const comment = await (this.prisma as any).taskComment.findUnique({
      where: { id },
      include: COMMENT_INCLUDE,
    });
    if (!comment) throw new NotFoundException('Task comment not found');
    return comment;
  }

  private ensureOpen(comment: any) {
    if (comment.status === 'CLOSED') {
      throw new BadRequestException('Closed comments cannot be changed');
    }
  }
}
