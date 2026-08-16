import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { resolveMentionedUsers } from '../common/mentions';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DemoService } from '../demo/demo.service';
import { AddWhiteboardMembersDto } from './dto/add-whiteboard-members.dto';
import { ApplyWhiteboardOpsDto } from './dto/apply-ops.dto';
import { CreateWhiteboardCommentDto } from './dto/create-whiteboard-comment.dto';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { CreateWhiteboardInviteDto } from './dto/create-whiteboard-invite.dto';
import { UpdateWhiteboardDto } from './dto/update-whiteboard.dto';
import { UpdateWhiteboardMemberDto } from './dto/update-whiteboard-member.dto';
import {
  applyWhiteboardOps,
  emptyWhiteboardDocument,
} from './validate-document';
import {
  BoardRow,
  boardTitle,
  formatWhiteboard,
  hasWhiteboardDocumentOps,
} from './whiteboard-format';
import {
  EDIT_ACTIVITY_WINDOW_MS,
  WhiteboardActivityType,
} from './whiteboard-activity';
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
  username: true,
  avatarUrl: true,
  roleTitle: true,
};

const PAGE_INCLUDE = {
  snapshot: true,
} as const;

const PAGE_LIST_SELECT = {
  id: true,
  index: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  snapshot: true,
} as const;

const BOARD_INCLUDE = {
  members: { include: { user: { select: MEMBER_SELECT } } },
  pages: { orderBy: { index: 'asc' as const }, include: PAGE_INCLUDE },
  lastEditedBy: {
    select: { id: true, fullName: true, avatarUrl: true, username: true },
  },
};

const BOARD_LIST_INCLUDE = {
  members: { include: { user: { select: MEMBER_SELECT } } },
  pages: { orderBy: { index: 'asc' as const }, select: PAGE_LIST_SELECT },
  lastEditedBy: {
    select: { id: true, fullName: true, avatarUrl: true, username: true },
  },
};

@Injectable()
export class WhiteboardsService {
  private readonly logger = new Logger(WhiteboardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly demoService: DemoService,
  ) {}

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
    if (member) return member;
    if (board.createdById === userId) {
      return {
        userId,
        role: WhiteboardRole.ADMIN,
        user: {
          id: userId,
          fullName: "",
          email: "",
          username: "",
          avatarUrl: null,
          roleTitle: null,
        },
      };
    }
    throw new ForbiddenException('You do not have access to this whiteboard');
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

    await this.recordActivity(
      row.id,
      userId,
      WhiteboardActivityType.CREATED,
    );
    await this.touchLastEdited(row.id, userId);

    return formatWhiteboard(row as unknown as BoardRow, userId, true);
  }

  async findByProject(userId: string, projectId: string) {
    await this.ensureProjectAccess(userId, projectId);

    const rows = await this.prisma.whiteboard.findMany({
      where: {
        projectId,
        members: { some: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      include: BOARD_LIST_INCLUDE,
    });

    return rows.map((row) =>
      formatWhiteboard(row as unknown as BoardRow, userId, false),
    );
  }

  async findMine(userId: string) {
    const rows = await this.prisma.whiteboard.findMany({
      where: {
        OR: [{ createdById: userId }, { members: { some: { userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: BOARD_LIST_INCLUDE,
    });

    return rows.map((row) =>
      formatWhiteboard(row as unknown as BoardRow, userId, false),
    );
  }

  async findOne(userId: string, id: string) {
    const row = await this.loadBoard(id);
    await this.ensureWhiteboardAccess(userId, row);
    return formatWhiteboard(row, userId, true);
  }

  async update(userId: string, id: string, dto: UpdateWhiteboardDto) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanDraw(member.role);

    if (dto.title === undefined) {
      throw new BadRequestException('Title is required');
    }

    const previousTitle = row.title;
    const updated = await this.prisma.whiteboard.update({
      where: { id },
      data: { title: dto.title },
      include: BOARD_INCLUDE,
    });

    if ((dto.title ?? '') !== (previousTitle ?? '')) {
      await this.recordActivity(id, userId, WhiteboardActivityType.TITLE_CHANGED, {
        title: dto.title,
      });
    }
    await this.touchLastEdited(id, userId);

    return formatWhiteboard(updated as unknown as BoardRow, userId, true);
  }

  async applyBoardOps(userId: string, id: string, dto: ApplyWhiteboardOpsDto) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    const firstPage = row.pages[0];
    if (!firstPage) throw new NotFoundException('Whiteboard page not found');

    const hasDocumentOps = hasWhiteboardDocumentOps(dto);
    if (!hasDocumentOps && dto.title === undefined) {
      throw new BadRequestException('At least one whiteboard op is required');
    }
    this.ensureCanDraw(member.role);

    if (hasDocumentOps) {
      return this.applyPageOps(userId, id, firstPage.id, dto);
    }

    const updated = await this.prisma.whiteboard.update({
      where: { id },
      data: { title: dto.title },
      include: BOARD_INCLUDE,
    });

    return formatWhiteboard(updated as unknown as BoardRow, userId, true);
  }

  async applyPageOps(
    userId: string,
    whiteboardId: string,
    pageId: string,
    dto: ApplyWhiteboardOpsDto,
  ) {
    const board = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
      select: {
        id: true,
        title: true,
        createdById: true,
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });
    if (!board) throw new NotFoundException('Whiteboard not found');

    const memberRole =
      board.members[0]?.role ??
      (board.createdById === userId ? WhiteboardRole.ADMIN : null);
    if (!memberRole) {
      throw new ForbiddenException('You do not have access to this whiteboard');
    }
    this.ensureCanDraw(memberRole);

    const page = await this.prisma.whiteboardPage.findUnique({
      where: { id: pageId },
      select: { id: true, whiteboardId: true, version: true },
    });
    if (!page || page.whiteboardId !== whiteboardId) {
      throw new NotFoundException('Whiteboard page not found');
    }

    const hasDocumentOps = hasWhiteboardDocumentOps(dto);
    if (!hasDocumentOps && dto.title === undefined) {
      throw new BadRequestException('At least one whiteboard op is required');
    }

    let version = page.version;
    if (hasDocumentOps) {
      version = await this.commitPageOps(whiteboardId, pageId, dto);
    }

    const updated = await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        updatedAt: new Date(),
      },
      select: { updatedAt: true },
    });

    if (dto.title !== undefined && dto.title !== board.title) {
      await this.recordActivity(
        whiteboardId,
        userId,
        WhiteboardActivityType.TITLE_CHANGED,
        { title: dto.title },
      );
    }
    if (hasDocumentOps) {
      await this.recordEditActivity(whiteboardId, userId);
    }
    await this.touchLastEdited(whiteboardId, userId);

    return {
      ok: true as const,
      whiteboardId,
      pageId,
      version,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /** Merge ops onto the latest page document using version as a compare-and-swap. */
  private async commitPageOps(
    whiteboardId: string,
    pageId: string,
    dto: ApplyWhiteboardOpsDto,
  ): Promise<number> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const page = await this.prisma.whiteboardPage.findUnique({
        where: { id: pageId },
      });
      if (!page || page.whiteboardId !== whiteboardId) {
        throw new NotFoundException('Whiteboard page not found');
      }

      const documentJson = applyWhiteboardOps(page.documentJson, dto);
      const result = await this.prisma.whiteboardPage.updateMany({
        where: { id: pageId, version: page.version },
        data: {
          documentJson: documentJson as object,
          version: { increment: 1 },
        },
      });
      if (result.count === 1) return page.version + 1;
    }

    throw new ConflictException(
      'This page was updated at the same time. Retry the merge.',
    );
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

    await this.recordActivity(
      whiteboardId,
      userId,
      WhiteboardActivityType.PAGE_ADDED,
      { index: nextIndex },
    );
    await this.touchLastEdited(whiteboardId, userId);

    return formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
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

    await this.recordActivity(
      whiteboardId,
      userId,
      WhiteboardActivityType.PAGE_DELETED,
      { pageId },
    );
    await this.touchLastEdited(whiteboardId, userId);

    return formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
  }

  async remove(userId: string, id: string) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanManage(member.role);

    const paths = row.pages
      .map((page) => page.snapshot?.storagePath)
      .filter((path): path is string => Boolean(path));
    await this.storage.deleteSnapshots(paths);

    const recipientIds = [
      ...row.members.map((member) => member.userId),
      row.createdById,
    ].filter((recipientId) => recipientId && recipientId !== userId);

    await this.prisma.whiteboard.delete({ where: { id } });

    await this.notifySafely(() =>
      this.notifications.notifyWhiteboardDeleted(
        recipientIds,
        id,
        boardTitle(row),
        row.projectId,
      ),
    );

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
    this.ensureCanManage(member.role);

    const page = row.pages.find((item) => item.id === pageId);
    if (!page) throw new NotFoundException('Whiteboard page not found');
    if (page.snapshot && (await this.demoService.isDemoUserId(userId))) {
      throw new ForbiddenException(
        'The demo board already has a saved image. Export that, or create an account to save more.',
      );
    }

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

    await this.recordActivity(
      whiteboardId,
      userId,
      WhiteboardActivityType.SNAPSHOT_SAVED,
      { pageId },
    );
    await this.touchLastEdited(whiteboardId, userId);

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

    const inviterName =
      actor.user.fullName.trim() ||
      (
        await this.prisma.user.findUnique({
          where: { id: userId },
          select: { fullName: true },
        })
      )?.fullName?.trim() ||
      'Someone';

    await Promise.all(
      membersToAdd.map((input) =>
        this.notifySafely(() =>
          this.notifications.notifyWhiteboardMemberAdded(
            input.userId,
            whiteboardId,
            boardTitle(row),
            inviterName,
            input.role,
            row.projectId,
          ),
        ),
      ),
    );

    const addedUsers = await this.prisma.user.findMany({
      where: { id: { in: membersToAdd.map((input) => input.userId) } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(addedUsers.map((user) => [user.id, user.fullName]));

    await Promise.all(
      membersToAdd.map((input) =>
        this.recordActivity(
          whiteboardId,
          userId,
          WhiteboardActivityType.MEMBER_ADDED,
          {
            userId: input.userId,
            role: input.role,
            name: nameById.get(input.userId),
          },
        ),
      ),
    );

    return formatWhiteboard(await this.loadBoard(whiteboardId), userId, true);
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

    if (target.role !== dto.role) {
      await this.recordActivity(
        whiteboardId,
        actorId,
        WhiteboardActivityType.ROLE_CHANGED,
        {
          userId,
          role: dto.role,
          name: target.user.fullName,
        },
      );
      await this.notifySafely(() =>
        this.notifications.notifyWhiteboardRoleChanged(
          userId,
          whiteboardId,
          boardTitle(row),
          dto.role,
        ),
      );
    }

    return formatWhiteboard(await this.loadBoard(whiteboardId), actorId, true);
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

    await this.recordActivity(
      whiteboardId,
      actorId,
      WhiteboardActivityType.MEMBER_REMOVED,
      { userId, name: target.user.fullName, role: target.role },
    );

    if (userId !== actorId) {
      await this.notifySafely(() =>
        this.notifications.notifyWhiteboardMemberRemoved(
          userId,
          whiteboardId,
          boardTitle(row),
        ),
      );
    }

    return formatWhiteboard(await this.loadBoard(whiteboardId), actorId, true);
  }

  async duplicate(userId: string, id: string) {
    const source = await this.loadBoard(id);
    await this.ensureWhiteboardAccess(userId, source);

    if (source.projectId) {
      await this.ensureProjectAccess(userId, source.projectId, false);
    }

    const title = `${boardTitle(source)} (copy)`;
    const created = await this.prisma.whiteboard.create({
      data: {
        title,
        projectId: source.projectId,
        createdById: userId,
        duplicatedFromId: source.id,
        lastEditedAt: new Date(),
        lastEditedById: userId,
        members: {
          create: { userId, role: WhiteboardRole.ADMIN },
        },
        pages: {
          create: source.pages.map((page) => ({
            index: page.index,
            documentJson: page.documentJson as object,
          })),
        },
      },
      include: BOARD_INCLUDE,
    });

    const createdBoard = created as unknown as BoardRow;
    await Promise.all(
      source.pages.map(async (page) => {
        if (!page.snapshot?.storagePath) return;
        const copy = createdBoard.pages.find((item) => item.index === page.index);
        if (!copy) return;
        const uploaded = await this.storage.copySnapshot(
          page.snapshot.storagePath,
          created.id,
          copy.id,
        );
        if (!uploaded) return;
        await this.prisma.whiteboardPageSnapshot.create({
          data: {
            pageId: copy.id,
            imageUrl: uploaded.imageUrl,
            storagePath: uploaded.storagePath,
            width: page.snapshot.width,
            height: page.snapshot.height,
          },
        });
      }),
    );

    await this.recordActivity(created.id, userId, WhiteboardActivityType.DUPLICATED, {
      sourceWhiteboardId: source.id,
      sourceTitle: boardTitle(source),
    });

    return formatWhiteboard(await this.loadBoard(created.id), userId, true);
  }

  async listActivity(userId: string, id: string) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    if (member.role === WhiteboardRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot see whiteboard activity');
    }

    const rows = await this.prisma.whiteboardActivity.findMany({
      where: { whiteboardId: id },
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return rows.map((item) => ({
      id: item.id,
      type: item.type,
      metadata: item.metadata,
      createdAt: item.createdAt.toISOString(),
      actor: item.actor,
    }));
  }

  async listComments(userId: string, id: string) {
    const row = await this.loadBoard(id);
    await this.ensureWhiteboardAccess(userId, row);

    const rows = await this.prisma.whiteboardComment.findMany({
      where: { whiteboardId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((item) => this.formatComment(item));
  }

  async addComment(
    userId: string,
    id: string,
    dto: CreateWhiteboardCommentDto,
  ) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanDraw(member.role);

    if (dto.pageId && !row.pages.some((page) => page.id === dto.pageId)) {
      throw new NotFoundException('Whiteboard page not found');
    }

    const mentioned = resolveMentionedUsers(
      dto.content,
      this.mentionCandidates(row),
    );

    const comment = await this.prisma.whiteboardComment.create({
      data: {
        whiteboardId: id,
        content: dto.content.trim(),
        pageId: dto.pageId ?? null,
        x: dto.x ?? null,
        y: dto.y ?? null,
        createdById: userId,
        mentionedUserIds: mentioned.map((user) => user.id),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            username: true,
          },
        },
      },
    });

    const actorName =
      comment.createdBy?.fullName ||
      member.user.fullName ||
      'Someone';

    await this.recordActivity(id, userId, WhiteboardActivityType.COMMENT_ADDED, {
      commentId: comment.id,
      pageId: dto.pageId ?? null,
      mentionedUserIds: mentioned.map((user) => user.id),
      mentionedNames: mentioned.map((user) => user.fullName),
    });

    await this.notifySafely(() =>
      this.notifications.notifyWhiteboardCommentMention(
        mentioned.map((user) => user.id).filter((mentionedId) => mentionedId !== userId),
        actorName,
        boardTitle(row),
        id,
        row.projectId,
      ),
    );

    return this.formatComment(comment);
  }

  async removeComment(userId: string, id: string, commentId: string) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    const comment = await this.prisma.whiteboardComment.findFirst({
      where: { id: commentId, whiteboardId: id },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.createdById !== userId && member.role !== WhiteboardRole.ADMIN) {
      throw new ForbiddenException('You cannot delete this comment');
    }
    await this.prisma.whiteboardComment.delete({ where: { id: commentId } });
    return { success: true };
  }

  async createInvite(
    userId: string,
    id: string,
    dto: CreateWhiteboardInviteDto,
  ) {
    const row = await this.loadBoard(id);
    const actor = await this.ensureWhiteboardAccess(userId, row);
    this.ensureCanManage(actor.role);

    const invite = await this.prisma.whiteboardInvite.create({
      data: {
        whiteboardId: id,
        role: dto.role,
        createdById: userId,
        token: randomBytes(24).toString('base64url'),
      },
    });

    return {
      token: invite.token,
      role: invite.role,
      url: `/whiteboard/join/${invite.token}`,
    };
  }

  async getInvite(token: string) {
    const invite = await this.loadInvite(token);
    if (invite.usedAt) {
      throw new BadRequestException('This invite link has already been used');
    }
    return {
      token: invite.token,
      role: invite.role,
      title: boardTitle(invite.whiteboard as unknown as BoardRow),
      projectId: invite.whiteboard.projectId,
    };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.loadInvite(token);
    if (invite.usedAt) {
      throw new BadRequestException('This invite link has already been used');
    }

    const board = invite.whiteboard as unknown as BoardRow;
    const existing = this.membership(board, userId);
    if (existing) {
      return formatWhiteboard(board, userId, true);
    }

    if (board.projectId) {
      await this.ensureProjectAccess(userId, board.projectId, true);
    }

    const claimed = await this.prisma.whiteboardInvite.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date(), usedById: userId },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This invite link has already been used');
    }

    await this.prisma.whiteboardMember.create({
      data: {
        userId,
        whiteboardId: board.id,
        role: invite.role,
      },
    });

    const inviterName = invite.createdBy.fullName || 'Someone';
    await this.recordActivity(
      board.id,
      invite.createdById,
      WhiteboardActivityType.MEMBER_ADDED,
      { userId, role: invite.role, via: 'invite' },
    );
    await this.notifySafely(() =>
      this.notifications.notifyWhiteboardMemberAdded(
        userId,
        board.id,
        boardTitle(board),
        inviterName,
        invite.role,
        board.projectId,
      ),
    );

    return formatWhiteboard(await this.loadBoard(board.id), userId, true);
  }

  async exportBoard(
    userId: string,
    id: string,
    format: 'pdf' | 'zip' | 'png',
    pageIds?: string[],
  ) {
    const row = await this.loadBoard(id);
    const member = await this.ensureWhiteboardAccess(userId, row);
    if (member.role === WhiteboardRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot export this whiteboard');
    }

    const pages = [...row.pages].sort((a, b) => a.index - b.index);
    const wanted = new Set((pageIds ?? []).filter(Boolean));
    const images: {
      pageId: string;
      name: string;
      buffer: Buffer;
      width: number;
      height: number;
    }[] = [];

    for (const page of pages) {
      if (wanted.size > 0 && !wanted.has(page.id)) continue;
      if (!page.snapshot?.storagePath) continue;
      const buffer = await this.storage.downloadSnapshot(page.snapshot.storagePath);
      if (!buffer) continue;
      images.push({
        pageId: page.id,
        name: `page-${page.index + 1}.png`,
        buffer,
        width: page.snapshot.width,
        height: page.snapshot.height,
      });
    }

    if (images.length === 0) {
      throw new BadRequestException(
        'Save the selected pages as images first, then export.',
      );
    }

    const slug = boardTitle(row)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'whiteboard';

    await this.recordActivity(id, userId, WhiteboardActivityType.EXPORTED, {
      format,
      pageCount: images.length,
    });

    if (format === 'png') {
      if (images.length > 1) {
        const zip = new JSZip();
        for (const image of images) zip.file(image.name, image.buffer);
        const buffer = Buffer.from(
          await zip.generateAsync({ type: 'nodebuffer' }),
        );
        return {
          buffer,
          filename: `${slug}.zip`,
          mime: 'application/zip',
        };
      }
      const image = images[0];
      return {
        buffer: image.buffer,
        filename: `${slug}.png`,
        mime: 'image/png',
      };
    }

    if (format === 'zip') {
      const zip = new JSZip();
      for (const image of images) zip.file(image.name, image.buffer);
      const buffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
      return {
        buffer,
        filename: `${slug}.zip`,
        mime: 'application/zip',
      };
    }

    const pdf = await PDFDocument.create();
    for (const image of images) {
      const embedded = await pdf.embedPng(image.buffer);
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    }
    const buffer = Buffer.from(await pdf.save());
    return {
      buffer,
      filename: `${slug}.pdf`,
      mime: 'application/pdf',
    };
  }

  private async loadInvite(token: string) {
    const invite = await this.prisma.whiteboardInvite.findUnique({
      where: { token },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        whiteboard: { include: BOARD_INCLUDE },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private mentionCandidates(row: BoardRow) {
    return row.members
      .filter((member) => member.user.username)
      .map((member) => ({
        id: member.userId,
        username: member.user.username,
        fullName: member.user.fullName,
      }));
  }

  private formatComment(item: {
    id: string;
    content: string;
    pageId: string | null;
    x: number | null;
    y: number | null;
    mentionedUserIds: unknown;
    createdAt: Date;
    createdById: string | null;
    createdBy: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
      username: string | null;
    } | null;
  }) {
    return {
      id: item.id,
      content: item.content,
      pageId: item.pageId,
      x: item.x,
      y: item.y,
      mentionedUserIds: Array.isArray(item.mentionedUserIds)
        ? item.mentionedUserIds
        : [],
      createdAt: item.createdAt.toISOString(),
      createdById: item.createdById,
      createdBy: item.createdBy,
    };
  }

  private async touchLastEdited(whiteboardId: string, userId: string) {
    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: {
        lastEditedAt: new Date(),
        lastEditedById: userId,
      },
    });
  }

  private async recordActivity(
    whiteboardId: string,
    actorId: string,
    type: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.whiteboardActivity.create({
      data: {
        whiteboardId,
        actorId,
        type,
        metadata: metadata ?? undefined,
      },
    });
  }

  private async recordEditActivity(whiteboardId: string, actorId: string) {
    const since = new Date(Date.now() - EDIT_ACTIVITY_WINDOW_MS);
    const existing = await this.prisma.whiteboardActivity.findFirst({
      where: {
        whiteboardId,
        actorId,
        type: WhiteboardActivityType.EDITED,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await this.prisma.whiteboardActivity.update({
        where: { id: existing.id },
        data: { createdAt: new Date() },
      });
      return;
    }

    await this.recordActivity(
      whiteboardId,
      actorId,
      WhiteboardActivityType.EDITED,
    );
  }

  private async notifySafely(send: () => Promise<unknown>) {
    try {
      await send();
    } catch (error) {
      this.logger.error(
        `Whiteboard notification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
