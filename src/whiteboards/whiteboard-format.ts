import { WhiteboardRole } from './whiteboard-role';

export type SnapshotRow = {
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
  updatedAt: Date;
} | null;

export type PageRow = {
  id: string;
  index: number;
  documentJson?: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  snapshot: SnapshotRow;
};

export type MemberRow = {
  userId: string;
  role: WhiteboardRole;
  user: {
    id: string;
    fullName: string;
    email: string;
    username: string;
    avatarUrl: string | null;
    roleTitle: string | null;
  };
};

export type BoardRow = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  lastEditedAt: Date | null;
  lastEditedById: string | null;
  lastEditedBy: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    username: string | null;
  } | null;
  duplicatedFromId: string | null;
  pages: PageRow[];
  members: MemberRow[];
};

export function hasWhiteboardDocumentOps(dto: {
  addedStrokes?: unknown[];
  removedStrokeIds?: string[];
  addedRegions?: unknown[];
  removedRegionIds?: string[];
  canvas?: unknown;
}) {
  return (
    (dto.addedStrokes?.length ?? 0) > 0 ||
    (dto.removedStrokeIds?.length ?? 0) > 0 ||
    (dto.addedRegions?.length ?? 0) > 0 ||
    (dto.removedRegionIds?.length ?? 0) > 0 ||
    dto.canvas != null
  );
}

function formatSnapshot(row: NonNullable<SnapshotRow>) {
  return {
    imageUrl: row.imageUrl,
    storagePath: row.storagePath,
    width: row.width,
    height: row.height,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatPage(page: PageRow, includeDocument: boolean) {
  return {
    id: page.id,
    index: page.index,
    version: page.version,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    snapshot: page.snapshot ? formatSnapshot(page.snapshot) : null,
    ...(includeDocument ? { documentJson: page.documentJson } : {}),
  };
}

function formatMember(member: MemberRow) {
  return {
    userId: member.userId,
    role: member.role,
    fullName: member.user.fullName,
    email: member.user.email,
    username: member.user.username,
    avatarUrl: member.user.avatarUrl,
    roleTitle: member.user.roleTitle,
  };
}

export function formatWhiteboard(
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
    lastEditedAt: row.lastEditedAt?.toISOString() ?? row.updatedAt.toISOString(),
    lastEditedBy: row.lastEditedBy
      ? {
          id: row.lastEditedBy.id,
          fullName: row.lastEditedBy.fullName,
          avatarUrl: row.lastEditedBy.avatarUrl,
          username: row.lastEditedBy.username,
        }
      : null,
    duplicatedFromId: row.duplicatedFromId,
    myRole:
      row.members.find((member) => member.userId === userId)?.role ??
      (row.createdById === userId ? WhiteboardRole.ADMIN : null),
    members: row.members.map((member) => formatMember(member)),
    pages: row.pages.map((page) => formatPage(page, includeDocuments)),
    snapshot: cover ? formatSnapshot(cover) : null,
  };
}

export function boardTitle(row: BoardRow) {
  return row.title?.trim() || 'Untitled whiteboard';
}
