import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

@Injectable()
export class SubtasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateSubtaskDto) {
    return (this.prisma as any).subtask.create({
      data: {
        title: dto.title,
        isCompleted: false,
        taskId: dto.taskId,
      },
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSubtaskDto) {
    await this.findOneOrFail(id);

    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.isCompleted !== undefined) data.isCompleted = dto.isCompleted;

    return (this.prisma as any).subtask.update({ where: { id }, data });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string) {
    await this.findOneOrFail(id);
    await (this.prisma as any).subtask.delete({ where: { id } });
    return { message: 'Subtask deleted successfully' };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async findOneOrFail(id: string) {
    const subtask = await (this.prisma as any).subtask.findUnique({ where: { id } });
    if (!subtask) throw new NotFoundException('Subtask not found');
    return subtask;
  }
}
