import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AddWhiteboardMembersDto } from './dto/add-whiteboard-members.dto';
import { ApplyWhiteboardOpsDto } from './dto/apply-ops.dto';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { UpdateWhiteboardDto } from './dto/update-whiteboard.dto';
import { UpdateWhiteboardMemberDto } from './dto/update-whiteboard-member.dto';
import {
  applyWhiteboardOps,
  emptyWhiteboardDocument,
} from './validate-document';
import { WhiteboardRole } from './whiteboard-role';

const PROJECT_EDIT_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
];

const PROJECT_ACCESS_ROLES = [...PROJECT_EDIT_ROLES, ProjectRole.VIEWER];

const DRAW_ROLES: WhiteboardRole[] = [
  WhiteboardRole.ADMIN,
  WhiteboardRole.MEMBER,
];

const MEMBER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  roleTitle: true,
};

const PAGE_INCLUDE = {
  snapshot: true,
} as const;

const BOARD_INCLUDE = {
  members: { include: { user: { select: MEMBER_SELECT } } },
  pages: { orderBy: { index: 'asc' as const }, include: PAGE_INCLUDE },
};

type SnapshotRow = {
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
  updatedAt: Date;
} | null;

type PageRow = {
  id: string;
  index: number;
  documentJson: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  snapshot: SnapshotRow;
};

type MemberRow = {
  userId: string;
  role: WhiteboardRole;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    roleTitle: string | null;
  };
};

type BoardRow = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  pages: PageRow[];
  members: MemberRow[];
};

@Injectable()
export class WhiteboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private formatSnapshot(row: NonNullable<SnapshotRow>) {
    return {
      imageUrl: row.imageUrl,
      storagePath: row.storagePath,
      width: row.width,
      height: row.height,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private formatPage(page: PageRow, includeDocument: boolean) {
    return {
      id: page.id,
      index: page.index,
      version: page.version,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      snapshot: page.snapshot ? this.formatSnapshot(page.snapshot) : null,
      ...(includeDocument ? { documentJson: page.documentJson } : {}),
    };
  }

  private formatMember(member: MemberRow) {
    return {
      userId: member.userId,
      role: member.role,
      fullName: member.user.fullName,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      roleTitle: member.user.roleTitle,
    };
  }

  private formatWhiteboard(
    row: BoardRow,
    userId: string,
    includeDocuments: boolean,
  ) {
    const cover =
      row.pages.find((page) => page.snapshot)?.snapshot ??
      row.pages[0]?.snapshot ??
      null;

    return {
      id: row.id,
      title: row.title,
      projectId: row.projectId,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      myRole:
        row.members.find((member) => member.userId === userId)?.role ?? null,
      members: row.members.map((member) => this.formatMember(member)),
      pages: row.pages.map((page) => this.formatPage(page, includeDocuments)),
      snapshot: cover ? this.formatSnapshot(cover) : null,
    };
  }

  private async loadBoard(id: string) {
    const row = await this.prisma.whiteboard.findUnique({
      where: { id },
      include: BOARD_INCLUDE,
    });
    if (!row) throw new NotFoundException('Whiteboard not found');
    return row as unknown as BoardRow;
  }

  private async ensureProjectAccess(
    userId: string,
    projectId: string,
    allowViewer = true,
  ) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    const allowed = allowViewer ? PROJECT_ACCESS_ROLES : PROJECT_EDIT_ROLES;

    if (
      !membership ||
      !allowed.includes(membership.role as (typeof allowed)[number])
    ) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  private membership(board: BoardRow, userId: string) {
    return board.members.find((member) => member.userId === userId) ?? null;
  }

  private async ensureWhiteboardAccess(userId: string, board: BoardRow) {
    const member = this.membership(board, userId);
    if (!member) {
      throw new ForbiddenException('You do not have access to this whiteboard');
    }
    return member;
  }

  private ensureCanDraw(role: WhiteboardRole) {
    if (!DRAW_ROLES.includes(role)) {
      throw new ForbiddenException('Viewers cannot edit this whiteboard');
    }
  }

  private ensureCanManage(role: WhiteboardRole) {
    if (role !== WhiteboardRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage this whiteboard');
    }
  }

  private ensureCanSaveImage(role: WhiteboardRole) {
    if (role !== WhiteboardRole.ADMIN) {
      throw new ForbiddenException('Only admins can save the board as an image');
    }
  }

  private adminCount(board: BoardRow) {
    return board.members.filter((member) => member.role === WhiteboardRole.ADMIN)
      .length;
  }

  async create(userId: string, dto: CreateWhiteboardDto) {
    if (dto.projectId) {
      await this.ensureProjectAccess(userId, dto.projectId, false);
    }

    const documentJson = emptyWhiteboardDocument();

    const row = await this.prisma.whiteboard.create({
      data: {
        title: dto.title ?? null,
        projectId: dto.projectId ?? null,
        createdById: userId,
        members: {
          create: { userId, role: WhiteboardRole.ADMIN },
        },
        pages: {
          create: {
            index: 0,
            documentJson: documentJson as object,
          },
        },
      },
      include: BOARD_INCLUDE,
    });

    return this.formatWhiteboard(row as unknown as BoardRow, userId, true);
  }

  async findByProject(userId: string, projectId: string) {
    await this.ensureProjectAccess(userId, projectId);

    const rows = await this.prisma.whiteboard.findMany({
      where: {
        projectId,
        members: { some: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      include: BOARD_INCLUDE,
    });

    return rows.map((row) =>
      this.formatWhiteboard(row as unknown as BoardRow, userId, false),
    );
  }

  async findMine(userId: string) {
    const rows = await this.prisma.whiteboard.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include: BOARD_INCLUDE,
    });

    return rows.map((row) =>
      this.formatWhiteboard(row as unknown as BoardRow, userId, false),
    );
  }

  async findOne(userId: string, id: string) {
    const row = await this.loadBoard(id);
    await this.ensureWhiteboardAccess(userId, row);
    return this.formatWhiteboard(row, userId, true);
  }

  async update(userId: string, id: string, dto: UpdateWhiteboardDto) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanDraw(member.role);

    if (dto.title === undefined) {
      throw new BadRequestException('Title is required');
    }

    const updated = await this.prisma.whiteboard.update({
      where: { id },
      data: { title: dto.title },
      include: BOARD_INCLUDE,
    });

    return this.formatWhiteboard(updated as unknown as BoardRow, userId, true);
  }

  async applyBoardOps(userId: string, id: string, dto: ApplyWhiteboardOpsDto) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    const firstPage = row.pages[0];
    if (!firstPage) throw new NotFoundException('Whiteboard page not found');

    const hasDocumentOps =
      (dto.addedStrokes?.length ?? 0) > 0 ||
      (dto.removedStrokeIds?.length ?? 0) > 0 ||
      (dto.addedRegions?.length ?? 0) > 0 ||
      (dto.removedRegionIds?.length ?? 0) > 0 ||
      dto.canvas != null;

    if (hasDocumentOps) this.ensureCanDraw(member.role);
    else if (dto.title === undefined) {
      throw new BadRequestException('At least one whiteboard op is required');
    } else {
      this.ensureCanDraw(member.role);
    }

    if (hasDocumentOps) {
      return this.applyPageOps(userId, id, firstPage.id, dto);
    }

    const updated = await this.prisma.whiteboard.update({
      where: { id },
      data: { title: dto.title },
      include: BOARD_INCLUDE,
    });

    return this.formatWhiteboard(updated as unknown as BoardRow, userId, true);
  }

  async applyPageOps(
    userId: string,
    whiteboardId: string,
    pageId: string,
    dto: ApplyWhiteboardOpsDto,
  ) {
    const row = await this.loadBoard(whiteboardId);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanDraw(member.role);

    const page = row.pages.find((item) => item.id === pageId);
    if (!page) throw new NotFoundException('Whiteboard page not found');

    const hasDocumentOps =
      (dto.addedStrokes?.length ?? 0) > 0 ||
      (dto.removedStrokeIds?.length ?? 0) > 0 ||
      (dto.addedRegions?.length ?? 0) > 0 ||
      (dto.removedRegionIds?.length ?? 0) > 0 ||
      dto.canvas != null;

    if (!hasDocumentOps && dto.title === undefined) {
      throw new BadRequestException('At least one whiteboard op is required');
    }

    const documentJson = hasDocumentOps
      ? applyWhiteboardOps(page.documentJson, dto)
      : undefined;

    await this.prisma.$transaction([
      ...(documentJson
        ? [
            this.prisma.whiteboardPage.update({
              where: { id: pageId },
              data: {
                documentJson: documentJson as object,
                version: { increment: 1 },
              },
            }),
          ]
        : []),
      this.prisma.whiteboard.update({
        where: { id: whiteboardId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          updatedAt: new Date(),
        },
      }),
    ]);

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
  }

  async addPage(userId: string, whiteboardId: string) {
    const row = await this.loadBoard(whiteboardId);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanDraw(member.role);

    const nextIndex =
      row.pages.reduce((max, page) => Math.max(max, page.index), -1) + 1;

    await this.prisma.whiteboardPage.create({
      data: {
        whiteboardId,
        index: nextIndex,
        documentJson: emptyWhiteboardDocument() as object,
      },
    });

    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: { updatedAt: new Date() },
    });

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
  }

  async removePage(userId: string, whiteboardId: string, pageId: string) {
    const row = await this.loadBoard(whiteboardId);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanManage(member.role);

    if (row.pages.length <= 1) {
      throw new BadRequestException('A whiteboard must have at least one page');
    }

    const page = row.pages.find((item) => item.id === pageId);
    if (!page) throw new NotFoundException('Whiteboard page not found');

    await this.storage.deleteSnapshot(
      whiteboardId,
      page.snapshot?.storagePath,
      pageId,
    );
    await this.prisma.whiteboardPage.delete({ where: { id: pageId } });

    const remaining = row.pages
      .filter((item) => item.id !== pageId)
      .sort((a, b) => a.index - b.index);

    await this.prisma.$transaction(
      remaining.map((item, index) =>
        this.prisma.whiteboardPage.update({
          where: { id: item.id },
          data: { index },
        }),
      ),
    );

    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: { updatedAt: new Date() },
    });

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
  }

  async remove(userId: string, id: string) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanManage(member.role);

    const paths = row.pages
      .map((page) => page.snapshot?.storagePath)
      .filter((path): path is string => Boolean(path));
    await this.storage.deleteSnapshots(paths);

    await this.prisma.whiteboard.delete({ where: { id } });

    return { success: true };
  }

  async upsertPageSnapshot(
    userId: string,
    whiteboardId: string,
    pageId: string,
    buffer: Buffer,
    width: number,
    height: number,
  ) {
    const row = await this.loadBoard(whiteboardId);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanSaveImage(member.role);

    const page = row.pages.find((item) => item.id === pageId);
    if (!page) throw new NotFoundException('Whiteboard page not found');

    const { storagePath, imageUrl } = await this.storage.uploadSnapshot(
      whiteboardId,
      pageId,
      buffer,
      'image/png',
      page.snapshot?.storagePath,
    );

    const snapshot = await this.prisma.whiteboardPageSnapshot.upsert({
      where: { pageId },
      create: {
        pageId,
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

  async addMembers(
    userId: string,
    whiteboardId: string,
    dto: AddWhiteboardMembersDto,
  ) {
    const row = await this.loadBoard(whiteboardId);
    const actor = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanManage(actor.role);

    const membersToAdd = dto.members?.length
      ? dto.members
      : [{ userId: dto.userId!, role: dto.role ?? WhiteboardRole.MEMBER }];

    const seen = new Set<string>();
    for (const input of membersToAdd) {
      if (seen.has(input.userId)) {
        throw new BadRequestException('Duplicate users in the invite list');
      }
      seen.add(input.userId);

      if (input.userId === userId) {
        throw new BadRequestException('You are already on this whiteboard');
      }

      const existing = this.membership(row, input.userId);
      if (existing) {
        throw new ConflictException('User is already on this whiteboard');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, isArchived: true },
      });
      if (!user || !user.isActive || user.isArchived) {
        throw new NotFoundException('User not found');
      }

      if (row.projectId) {
        const projectMember = await this.prisma.projectMember.findUnique({
          where: {
            userId_projectId: {
              userId: input.userId,
              projectId: row.projectId,
            },
          },
        });
        if (!projectMember) {
          throw new BadRequestException(
            'Project whiteboards can only include people from that project',
          );
        }
      }
    }

    await this.prisma.whiteboardMember.createMany({
      data: membersToAdd.map((input) => ({
        userId: input.userId,
        whiteboardId,
        role: input.role,
      })),
    });

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
  }

  async updateMember(
    actorId: string,
    whiteboardId: string,
    userId: string,
    dto: UpdateWhiteboardMemberDto,
  ) {
    const row = await this.loadBoard(whiteboardId);
    const actor = await this.ensureWhiteboardAccess(actorId, row);
    this.ensureCanManage(actor.role);

    const target = this.membership(row, userId);
    if (!target) throw new NotFoundException('Whiteboard member not found');

    if (
      target.role === WhiteboardRole.ADMIN &&
      dto.role !== WhiteboardRole.ADMIN &&
      this.adminCount(row) <= 1
    ) {
      throw new BadRequestException('A whiteboard must have at least one admin');
    }

    await this.prisma.whiteboardMember.update({
      where: { userId_whiteboardId: { userId, whiteboardId } },
      data: { role: dto.role },
    });

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), actorId, true);
  }

  async removeMember(actorId: string, whiteboardId: string, userId: string) {
    const row = await this.loadBoard(whiteboardId);
    const actor = await this.ensureWhiteboardAccess(actorId, row);
    this.ensureCanManage(actor.role);

    const target = this.membership(row, userId);
    if (!target) throw new NotFoundException('Whiteboard member not found');

    if (target.role === WhiteboardRole.ADMIN && this.adminCount(row) <= 1) {
      throw new BadRequestException('A whiteboard must have at least one admin');
    }

    await this.prisma.whiteboardMember.delete({
      where: { userId_whiteboardId: { userId, whiteboardId } },
    });

    return this.formatWhiteboard(await this.loadBoard(whiteboardId), actorId, true);
  }
}
