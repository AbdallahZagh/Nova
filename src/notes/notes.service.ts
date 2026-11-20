import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { myProjectsWhere } from '../common/task-access';
import { PrismaService } from '../prisma/prisma.service';
import { WriteNoteDto } from './dto/write-note.dto';
import {
  ChecklistItem,
  MAX_FLOATING_NOTES,
  noteIsEmpty,
  normalizeChecklist,
  previewText,
} from './note.logic';
import { NotesRealtime } from './notes-realtime';

const noteInclude = {
  project: { select: { id: true, name: true, status: true } },
} as const;

type NoteRow = {
  id: string;
  userId: string;
  projectId: string | null;
  title: string | null;
  body: string;
  checklist: unknown;
  color: string;
  pinned: boolean;
  floating: boolean;
  posX: number | null;
  posY: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string; status: string } | null;
};

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: NotesRealtime,
  ) {}

  async list(
    userId: string,
    query: {
      projectId?: string;
      scope?: string;
      pinned?: string;
      floating?: string;
      color?: string;
      q?: string;
    },
  ) {
    const where: Prisma.NoteWhereInput = { userId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.scope === 'personal') where.projectId = null;
    if (query.scope === 'project') where.projectId = { not: null };
    if (query.pinned === 'true') where.pinned = true;
    if (query.floating === 'true') where.floating = true;
    if (query.color) where.color = query.color as Prisma.NoteWhereInput['color'];
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.note.findMany({
      where,
      include: noteInclude,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return { items: rows.map((row) => this.toResponse(row as NoteRow)) };
  }

  async get(userId: string, id: string) {
    return this.toResponse(await this.findOwned(userId, id));
  }

  async create(userId: string, dto: WriteNoteDto, id?: string) {
    if (id) {
      const existing = await this.prisma.note.findUnique({ where: { id }, include: noteInclude });
      if (existing) {
        if (existing.userId !== userId) throw new ConflictException('The note ID is already in use.');
        return this.toResponse(existing);
      }
    }
    const checklist = this.checklistOrEmpty(dto.checklist);
    const title = this.cleanTitle(dto.title);
    const body = dto.body ?? '';
    if (noteIsEmpty({ title, body, checklist })) {
      throw new BadRequestException('Write a title, some text, or a checklist item.');
    }
    if (dto.projectId) await this.assertProjectAccess(userId, dto.projectId);
    const floating = Boolean(dto.floating);
    let created: NoteRow;
    try {
      created = await this.prisma.note.create({
        data: {
          ...(id ? { id } : {}),
          userId,
          title,
          body,
          checklist,
          color: dto.color ?? 'AMBER',
          pinned: Boolean(dto.pinned),
          floating,
          posX: dto.posX ?? null,
          posY: dto.posY ?? null,
          width: dto.width ?? null,
          height: dto.height ?? null,
          projectId: dto.projectId ?? null,
        },
        include: noteInclude,
      });
    } catch (error) {
      if (!id || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.note.findUnique({ where: { id }, include: noteInclude });
      if (!existing || existing.userId !== userId) throw new ConflictException('The note ID is already in use.');
      return this.toResponse(existing);
    }
    if (floating) await this.capFloating(userId, created.id);
    const note = this.toResponse(created);
    this.realtime.publish(userId, { kind: 'saved', note });
    return note;
  }

  async update(userId: string, id: string, dto: WriteNoteDto) {
    const existing = await this.findOwned(userId, id);
    const checklist =
      dto.checklist === undefined
        ? this.readChecklist(existing.checklist)
        : this.checklistOrThrow(dto.checklist);
    const title = dto.title === undefined ? existing.title : this.cleanTitle(dto.title);
    const body = dto.body === undefined ? existing.body : (dto.body ?? '');
    if (noteIsEmpty({ title, body, checklist })) {
      throw new BadRequestException('Write a title, some text, or a checklist item.');
    }
    if (dto.projectId) await this.assertProjectAccess(userId, dto.projectId);
    if (dto.floating === true && !existing.floating) await this.capFloating(userId, id);
    const updated = await this.prisma.note.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title } : {}),
        ...(dto.body !== undefined ? { body } : {}),
        ...(dto.checklist !== undefined ? { checklist } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        ...(dto.floating !== undefined ? { floating: dto.floating } : {}),
        ...(dto.posX !== undefined ? { posX: dto.posX } : {}),
        ...(dto.posY !== undefined ? { posY: dto.posY } : {}),
        ...(dto.width !== undefined ? { width: dto.width } : {}),
        ...(dto.height !== undefined ? { height: dto.height } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      },
      include: noteInclude,
    });
    const note = this.toResponse(updated as NoteRow);
    this.realtime.publish(userId, { kind: 'saved', note });
    return note;
  }

  async remove(userId: string, id: string) {
    const existing = await this.findOwned(userId, id);
    await this.prisma.note.delete({ where: { id: existing.id } });
    this.realtime.publish(userId, { kind: 'deleted', id: existing.id });
    return { message: 'Note deleted' };
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.note.findFirst({
      where: { id, userId },
      include: noteInclude,
    });
    if (!row) throw new NotFoundException('Note not found');
    return row as NoteRow;
  }

  private async assertProjectAccess(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...myProjectsWhere(userId) },
      select: { id: true },
    });
    if (!project) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  private async capFloating(userId: string, keepId?: string) {
    const floating = await this.prisma.note.findMany({
      where: { userId, floating: true, ...(keepId ? { id: { not: keepId } } : {}) },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    });
    const overflow = floating.length - (MAX_FLOATING_NOTES - 1);
    if (overflow <= 0) return;
    await this.prisma.note.updateMany({
      where: { id: { in: floating.slice(0, overflow).map((row) => row.id) } },
      data: { floating: false },
    });
  }

  private checklistOrEmpty(value: unknown) {
    if (value === undefined) return [];
    return this.checklistOrThrow(value);
  }

  private checklistOrThrow(value: unknown) {
    try {
      return normalizeChecklist(value);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Checklist is invalid.',
      );
    }
  }

  private readChecklist(value: unknown): ChecklistItem[] {
    try {
      return normalizeChecklist(value);
    } catch {
      return [];
    }
  }

  private cleanTitle(value: string | null | undefined) {
    return value?.trim() ? value : null;
  }

  private toResponse(row: NoteRow) {
    const checklist = this.readChecklist(row.checklist);
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      checklist,
      color: row.color,
      pinned: row.pinned,
      floating: row.floating,
      posX: row.posX,
      posY: row.posY,
      width: row.width,
      height: row.height,
      preview: previewText(row.body, checklist),
      projectId: row.projectId,
      project: row.project,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
