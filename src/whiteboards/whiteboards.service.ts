import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { UpdateWhiteboardDto } from './dto/update-whiteboard.dto';
import {
  emptyWhiteboardDocument,
  validateWhiteboardDocument,
} from './validate-document';

const PROJECT_ACCESS_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
];

@Injectable()
export class WhiteboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private formatWhiteboard(row: {
    id: string;
    title: string | null;
    documentJson: unknown;
    version: number;
    projectId: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    snapshot?: {
      imageUrl: string;
      storagePath: string;
      width: number;
      height: number;
      updatedAt: Date;
    } | null;
  }) {
    return {
      id: row.id,
      title: row.title,
      documentJson: row.documentJson,
      version: row.version,
      projectId: row.projectId,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      snapshot: row.snapshot
        ? {
            imageUrl: row.snapshot.imageUrl,
            storagePath: row.snapshot.storagePath,
            width: row.snapshot.width,
            height: row.snapshot.height,
            updatedAt: row.snapshot.updatedAt.toISOString(),
          }
        : null,
    };
  }

  private async ensureProjectAccess(userId: string, projectId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!membership || !PROJECT_ACCESS_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  private async ensureWhiteboardAccess(
    userId: string,
    whiteboard: { projectId: string | null; createdById: string },
  ) {
    if (whiteboard.projectId) {
      await this.ensureProjectAccess(userId, whiteboard.projectId);
      return;
    }

    if (whiteboard.createdById !== userId) {
      throw new ForbiddenException('You do not have access to this whiteboard');
    }
  }

  async create(userId: string, dto: CreateWhiteboardDto) {
    if (dto.projectId) {
      await this.ensureProjectAccess(userId, dto.projectId);
    }

    const documentJson = emptyWhiteboardDocument();

    const row = await this.prisma.whiteboard.create({
      data: {
        title: dto.title ?? null,
        projectId: dto.projectId ?? null,
        createdById: userId,
        documentJson: documentJson as object,
      },
      include: { snapshot: true },
    });

    return this.formatWhiteboard(row);
  }

  async findByProject(userId: string, projectId: string) {
    await this.ensureProjectAccess(userId, projectId);

    const rows = await this.prisma.whiteboard.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: { snapshot: true },
    });

    return rows.map((row) => this.formatWhiteboard(row));
  }

  async findMine(userId: string) {
    const rows = await this.prisma.whiteboard.findMany({
      where: {
        OR: [{ createdById: userId }, { project: { members: { some: { userId } } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: { snapshot: true },
    });

    return rows.map((row) => this.formatWhiteboard(row));
  }

  async findOne(userId: string, id: string) {
    const row = await this.prisma.whiteboard.findUnique({
      where: { id },
      include: { snapshot: true },
    });

    if (!row) throw new NotFoundException('Whiteboard not found');

    await this.ensureWhiteboardAccess(userId, row);

    return this.formatWhiteboard(row);
  }

  async update(userId: string, id: string, dto: UpdateWhiteboardDto) {
    const row = await this.prisma.whiteboard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Whiteboard not found');

    await this.ensureWhiteboardAccess(userId, row);

    if (dto.version !== row.version) {
      throw new ConflictException({
        message: 'Whiteboard version conflict',
        currentVersion: row.version,
      });
    }

    const documentJson = validateWhiteboardDocument(dto.documentJson);

    const updated = await this.prisma.whiteboard.update({
      where: { id },
      data: {
        documentJson: documentJson as object,
        version: { increment: 1 },
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
      include: { snapshot: true },
    });

    return this.formatWhiteboard(updated);
  }

  async remove(userId: string, id: string) {
    const row = await this.prisma.whiteboard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Whiteboard not found');

    await this.ensureWhiteboardAccess(userId, row);

    await this.storage.deleteSnapshot(id).catch(() => undefined);

    await this.prisma.whiteboard.delete({ where: { id } });

    return { success: true };
  }

  async upsertSnapshot(
    userId: string,
    id: string,
    buffer: Buffer,
    width: number,
    height: number,
  ) {
    const row = await this.prisma.whiteboard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Whiteboard not found');

    await this.ensureWhiteboardAccess(userId, row);

    const { storagePath, imageUrl } = await this.storage.uploadSnapshot(
      id,
      buffer,
    );

    const snapshot = await this.prisma.whiteboardSnapshot.upsert({
      where: { whiteboardId: id },
      create: {
        whiteboardId: id,
        imageUrl,
        storagePath,
        width,
        height,
      },
      update: {
        imageUrl,
        storagePath,
        width,
        height,
      },
    });

    return {
      imageUrl: snapshot.imageUrl,
      storagePath: snapshot.storagePath,
      width: snapshot.width,
      height: snapshot.height,
      updatedAt: snapshot.updatedAt.toISOString(),
    };
  }
}
