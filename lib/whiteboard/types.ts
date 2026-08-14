export type StrokeTool = "pen" | "eraser" | "highlighter";

export type StrokePoint = {
  x: number;
  y: number;
  pressure?: number;
  t: number;
};

export type Stroke = {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  tool: StrokeTool;
};

export type SemanticRegion = {
  id: string;
  kind: "project" | "task" | "subtask" | "assignee" | "note";
  bounds: { x: number; y: number; w: number; h: number };
  parentRegionId?: string;
  strokeIds?: string[];
};

export type WhiteboardDocument = {
  canvas: { width: number; height: number };
  strokes: Stroke[];
  regions: SemanticRegion[];
};

export type WhiteboardSnapshot = {
  imageUrl: string;
  storagePath: string;
  width: number;
  height: number;
  updatedAt: string;
};

export type WhiteboardRole = "ADMIN" | "MEMBER" | "VIEWER";

export type WhiteboardPage = {
  id: string;
  index: number;
  version: number;
  documentJson: WhiteboardDocument;
  snapshot: WhiteboardSnapshot | null;
  createdAt?: string;
  updatedAt?: string;
};

export type WhiteboardMember = {
  userId: string;
  role: WhiteboardRole;
  fullName: string;
  email: string;
  username?: string | null;
  avatarUrl: string | null;
  roleTitle?: string | null;
};

export type WhiteboardLastEditor = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  username?: string | null;
};

export type Whiteboard = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string | null;
  lastEditedBy?: WhiteboardLastEditor | null;
  duplicatedFromId?: string | null;
  myRole: WhiteboardRole | null;
  members: WhiteboardMember[];
  pages: WhiteboardPage[];
  snapshot: WhiteboardSnapshot | null;
};

export type WhiteboardOps = {
  addedStrokes?: Stroke[];
  removedStrokeIds?: string[];
  addedRegions?: SemanticRegion[];
  removedRegionIds?: string[];
  canvas?: { width: number; height: number };
  title?: string;
};

export type PresencePlatform = "web" | "ios" | "android";

export type WhiteboardPresence = {
  userId: string;
  name: string;
  color: string;
  platform: PresencePlatform;
  drawing?: boolean;
  isSelf?: boolean;
  x?: number;
  y?: number;
};

export function presenceSessionKey(userId: string, platform: PresencePlatform) {
  return `${userId}:${platform}`;
}

export type OnlinePresence = {
  userId: string;
  name: string;
  color: string;
  isSelf?: boolean;
  drawing?: boolean;
  platforms: PresencePlatform[];
};

export function groupOnlinePresence(
  people: WhiteboardPresence[],
): OnlinePresence[] {
  const byUser = new Map<string, OnlinePresence>();
  for (const peer of people) {
    const existing = byUser.get(peer.userId);
    if (existing) {
      if (!existing.platforms.includes(peer.platform)) {
        existing.platforms.push(peer.platform);
      }
      existing.drawing = Boolean(existing.drawing || peer.drawing);
      existing.isSelf = Boolean(existing.isSelf || peer.isSelf);
    } else {
      byUser.set(peer.userId, {
        userId: peer.userId,
        name: peer.name,
        color: peer.color,
        isSelf: peer.isSelf,
        drawing: peer.drawing,
        platforms: [peer.platform],
      });
    }
  }
  const rank = (platform: PresencePlatform) =>
    platform === "web" ? 0 : platform === "android" ? 1 : 2;
  return [...byUser.values()].map((person) => ({
    ...person,
    platforms: [...person.platforms].sort((a, b) => rank(a) - rank(b)),
  }));
}

export function presenceDeviceLabel(platform?: string) {
  if (platform === "ios" || platform === "android") return "App";
  return "Web";
}

export function canDrawOnBoard(role: WhiteboardRole | null | undefined) {
  return role === "ADMIN" || role === "MEMBER";
}

export function canCommentOnBoard(role: WhiteboardRole | null | undefined) {
  return canDrawOnBoard(role);
}

export function canViewBoardActivity(role: WhiteboardRole | null | undefined) {
  return canDrawOnBoard(role);
}

export function canExportBoard(role: WhiteboardRole | null | undefined) {
  return role === "ADMIN" || role === "MEMBER";
}

export function canSaveBoardImage(role: WhiteboardRole | null | undefined) {
  return role === "ADMIN";
}

export function canManageBoard(role: WhiteboardRole | null | undefined) {
  return role === "ADMIN";
}

export const DEFAULT_CANVAS = { width: 2000, height: 1500 } as const;

/** Phone-like surface used on web so both clients share one aspect ratio. */
export const BOARD_VIEW_ASPECT = "9 / 16";

export const BOARD_INSET = 16;

export const TOOL_SIZE_PRESETS: Record<StrokeTool, readonly number[]> = {
  pen: [2, 4, 8, 14, 22],
  highlighter: [12, 20, 32, 44],
  eraser: [16, 32, 56, 80, 120],
};

export const DEFAULT_TOOL_WIDTH: Record<StrokeTool, number> = {
  pen: 4,
  highlighter: 20,
  eraser: 56,
};

export const STROKE_WIDTH_MIN = 1;
export const STROKE_WIDTH_MAX = 40;
export const ERASER_WIDTH_MIN = 8;
export const ERASER_WIDTH_MAX = 120;

export const PRESENCE_COLORS = [
  "#e66a17",
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
] as const;

export function emptyWhiteboardDocument(): WhiteboardDocument {
  return {
    canvas: { ...DEFAULT_CANVAS },
    strokes: [],
    regions: [],
  };
}

export function newStrokeId() {
  return crypto.randomUUID();
}

export function presenceColorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 16777619 + userId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash * 137.508) % 360;
  const sat = 0.58 + (Math.abs(hash >> 8) % 25) / 100;
  const light = 0.48 + (Math.abs(hash >> 16) % 14) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
