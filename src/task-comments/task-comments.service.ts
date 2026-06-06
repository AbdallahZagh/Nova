import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { ReplyTaskCommentDto } from './dto/reply-task-comment.dto';

const COMMENT_USER_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  roleTitle: true,
};

const COMMENT_INCLUDE = {
  createdBy: { select: COMMENT_USER_SELECT },
  repliedBy: { select: COMMENT_USER_SELECT },
  closedBy: { select: COMMENT_USER_SELECT },
  task: { select: { id: true, title: true, projectId: true } },
};

@Injectable()
export class TaskCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTaskCommentDto) {
    const task = await this.findTaskOrFail(dto.taskId);

    return (this.prisma as any).taskComment.create({
      data: {
        content: dto.content,
        taskId: task.id,
        createdById: userId,
      },
      include: COMMENT_INCLUDE,
    });
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

    return (this.prisma as any).taskComment.update({
      where: { id },
      data: {
        replyContent: dto.replyContent,
        repliedById: userId,
        repliedAt: new Date(),
      },
      include: COMMENT_INCLUDE,
    });
  }

  async close(id: string, userId: string) {
    const comment = await this.findCommentOrFail(id);
    this.ensureOpen(comment);

    return (this.prisma as any).taskComment.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedById: userId,
        closedAt: new Date(),
      },
      include: COMMENT_INCLUDE,
    });
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
