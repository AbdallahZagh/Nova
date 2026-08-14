import { apiClient } from "@/api/apiClient";

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

export type Whiteboard = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string | null;
  lastEditedBy?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    username?: string | null;
  } | null;
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

export const DEFAULT_CANVAS = { width: 2000, height: 1500 } as const;

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

export type PresencePlatform = "web" | "ios" | "android";

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
  people: {
    userId: string;
    name: string;
    color: string;
    platform: PresencePlatform;
    drawing?: boolean;
    isSelf?: boolean;
  }[],
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

export function fitBoard(
  viewW: number,
  viewH: number,
  boardW: number,
  boardH: number,
) {
  const zoom = Math.min(
    viewW / Math.max(1, boardW),
    viewH / Math.max(1, boardH),
  );
  return {
    zoom,
    zoomX: zoom,
    zoomY: zoom,
    panX: (viewW - boardW * zoom) / 2,
    panY: (viewH - boardH * zoom) / 2,
  };
}

export function platformLabel(platform?: string) {
  if (platform === "ios") return "iPhone";
  if (platform === "android") return "Android";
  return "Web";
}

export const PRESENCE_COLORS = [
  "#e66a17",
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
] as const;

export function emptyWhiteboardDocument(): WhiteboardDocument {
  return { canvas: { ...DEFAULT_CANVAS }, strokes: [], regions: [] };
}

export function newStrokeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

export function normalizeDocument(raw: unknown): WhiteboardDocument {
  if (!raw || typeof raw !== "object") return emptyWhiteboardDocument();
  const doc = raw as Partial<WhiteboardDocument>;
  return {
    canvas: {
      width: doc.canvas?.width ?? DEFAULT_CANVAS.width,
      height: doc.canvas?.height ?? DEFAULT_CANVAS.height,
    },
    strokes: Array.isArray(doc.strokes) ? doc.strokes : [],
    regions: Array.isArray(doc.regions) ? doc.regions : [],
  };
}

export function applyOpsLocally(
  current: WhiteboardDocument,
  ops: WhiteboardOps,
): WhiteboardDocument {
  const removedStrokeIds = new Set(ops.removedStrokeIds ?? []);
  const strokeMap = new Map(
    current.strokes
      .filter((stroke) => !removedStrokeIds.has(stroke.id))
      .map((stroke) => [stroke.id, stroke]),
  );
  for (const stroke of ops.addedStrokes ?? []) {
    if (removedStrokeIds.has(stroke.id)) continue;
    strokeMap.set(stroke.id, stroke);
  }

  const removedRegionIds = new Set(ops.removedRegionIds ?? []);
  const regionMap = new Map(
    current.regions
      .filter((region) => !removedRegionIds.has(region.id))
      .map((region) => [region.id, region]),
  );
  for (const region of ops.addedRegions ?? []) {
    if (removedRegionIds.has(region.id)) continue;
    regionMap.set(region.id, region);
  }

  return {
    canvas: ops.canvas ?? current.canvas,
    strokes: [...strokeMap.values()],
    regions: [...regionMap.values()],
  };
}

export function mergeDocuments(
  server: WhiteboardDocument,
  local: WhiteboardDocument,
): WhiteboardDocument {
  const strokes = new Map(server.strokes.map((stroke) => [stroke.id, stroke]));
  for (const stroke of local.strokes) {
    const existing = strokes.get(stroke.id);
    if (!existing || stroke.points.length >= existing.points.length) {
      strokes.set(stroke.id, stroke);
    }
  }
  const regions = new Map(server.regions.map((region) => [region.id, region]));
  for (const region of local.regions) {
    if (!regions.has(region.id)) regions.set(region.id, region);
  }
  return {
    canvas: local.canvas ?? server.canvas,
    strokes: [...strokes.values()],
    regions: [...regions.values()],
  };
}

export type HistoryEntry =
  | { type: "add"; stroke: Stroke }
  | { type: "remove"; strokes: Stroke[] };

export function invertHistory(entry: HistoryEntry): WhiteboardOps {
  if (entry.type === "add") return { removedStrokeIds: [entry.stroke.id] };
  return { addedStrokes: entry.strokes };
}

export function applyHistory(entry: HistoryEntry): WhiteboardOps {
  if (entry.type === "add") return { addedStrokes: [entry.stroke] };
  return { removedStrokeIds: entry.strokes.map((stroke) => stroke.id) };
}

type ApiWhiteboardMember = {
  userId: string;
  role: WhiteboardRole;
  fullName: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  roleTitle?: string | null;
};

type ApiWhiteboardPage = {
  id: string;
  index: number;
  version: number;
  documentJson?: unknown;
  snapshot?: WhiteboardSnapshot | null;
  createdAt?: string;
  updatedAt?: string;
};

type ApiWhiteboard = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string | null;
  lastEditedBy?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    username?: string | null;
  } | null;
  myRole?: WhiteboardRole | null;
  members?: ApiWhiteboardMember[];
  pages?: ApiWhiteboardPage[];
  snapshot?: WhiteboardSnapshot | null;
};

function mapMember(row: ApiWhiteboardMember): WhiteboardMember {
  return {
    userId: row.userId,
    role: row.role,
    fullName: row.fullName,
    email: row.email,
    username: row.username ?? null,
    avatarUrl: row.avatarUrl ?? null,
    roleTitle: row.roleTitle,
  };
}

function mapPage(row: ApiWhiteboardPage): WhiteboardPage {
  return {
    id: row.id,
    index: row.index,
    version: row.version,
    documentJson: normalizeDocument(row.documentJson ?? emptyWhiteboardDocument()),
    snapshot: row.snapshot ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWhiteboard(row: ApiWhiteboard): Whiteboard {
  const pages = (row.pages ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(mapPage);
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastEditedAt: row.lastEditedAt ?? row.updatedAt,
    lastEditedBy: row.lastEditedBy ?? null,
    myRole: row.myRole ?? null,
    members: (row.members ?? []).map(mapMember),
    pages,
    snapshot: row.snapshot ?? pages.find((page) => page.snapshot)?.snapshot ?? null,
  };
}

export async function listWhiteboardsApi() {
  const response = await apiClient.get<ApiWhiteboard[] | { data?: ApiWhiteboard[] }>(
    "/api/whiteboards",
  );
  const rows = Array.isArray(response.data)
    ? response.data
    : (response.data.data ?? []);
  return rows.map(mapWhiteboard);
}

export async function listProjectWhiteboardsApi(projectId: string) {
  const response = await apiClient.get<ApiWhiteboard[]>(
    `/api/projects/${projectId}/whiteboards`,
  );
  return response.data.map(mapWhiteboard);
}

export async function getWhiteboardApi(id: string) {
  const response = await apiClient.get<ApiWhiteboard>(`/api/whiteboards/${id}`);
  return mapWhiteboard(response.data);
}

export async function createWhiteboardApi(input: {
  title?: string;
  projectId?: string;
}) {
  const response = await apiClient.post<ApiWhiteboard>("/api/whiteboards", {
    ...(input.title ? { title: input.title } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  });
  return mapWhiteboard(response.data);
}

export async function duplicateWhiteboardApi(id: string) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboards/${id}/duplicate`,
  );
  return mapWhiteboard(response.data);
}

export type WhiteboardActivity = {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    username?: string | null;
  } | null;
};

export async function listWhiteboardActivityApi(id: string) {
  const response = await apiClient.get<WhiteboardActivity[]>(
    `/api/whiteboards/${id}/activity`,
  );
  return response.data;
}

export type WhiteboardComment = {
  id: string;
  content: string;
  pageId: string | null;
  mentionedUserIds: string[];
  createdAt: string;
  createdById: string | null;
  createdBy: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    username?: string | null;
  } | null;
};

export async function listWhiteboardCommentsApi(id: string) {
  const response = await apiClient.get<WhiteboardComment[]>(
    `/api/whiteboards/${id}/comments`,
  );
  return response.data;
}

export async function createWhiteboardCommentApi(
  id: string,
  input: { content: string; pageId?: string },
) {
  const response = await apiClient.post<WhiteboardComment>(
    `/api/whiteboards/${id}/comments`,
    input,
  );
  return response.data;
}

export async function deleteWhiteboardCommentApi(id: string, commentId: string) {
  await apiClient.delete(`/api/whiteboards/${id}/comments/${commentId}`);
}

export async function createWhiteboardInviteApi(
  id: string,
  role: WhiteboardRole,
) {
  const response = await apiClient.post<{
    token: string;
    role: WhiteboardRole;
    url: string;
  }>(`/api/whiteboards/${id}/invites`, { role });
  return response.data;
}

export async function getWhiteboardInviteApi(token: string) {
  const response = await apiClient.get<{
    token: string;
    role: WhiteboardRole;
    title: string;
    projectId: string | null;
  }>(`/api/whiteboard-invites/${token}`);
  return response.data;
}

export async function acceptWhiteboardInviteApi(token: string) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboard-invites/${token}/accept`,
  );
  return mapWhiteboard(response.data);
}

export async function downloadWhiteboardExportApi(
  id: string,
  format: "pdf" | "zip" | "png",
  pageIds?: string[],
) {
  const query = pageIds?.length
    ? `?pageIds=${encodeURIComponent(pageIds.join(","))}`
    : "";
  const response = await apiClient.get<ArrayBuffer>(
    `/api/whiteboards/${id}/export/${format}${query}`,
    { responseType: "arraybuffer", timeout: 60_000 },
  );
  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return {
    buffer: response.data,
    filename: match?.[1] ?? `whiteboard.${format}`,
  };
}

export async function applyWhiteboardOpsApi(id: string, ops: WhiteboardOps) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboards/${id}/ops`,
    ops,
  );
  return mapWhiteboard(response.data);
}

export async function applyWhiteboardPageOpsApi(
  id: string,
  pageId: string,
  ops: WhiteboardOps,
) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboards/${id}/pages/${pageId}/ops`,
    ops,
  );
  return mapWhiteboard(response.data);
}

export async function addWhiteboardPageApi(id: string) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboards/${id}/pages`,
  );
  return mapWhiteboard(response.data);
}

export async function deleteWhiteboardPageApi(id: string, pageId: string) {
  const response = await apiClient.delete<ApiWhiteboard>(
    `/api/whiteboards/${id}/pages/${pageId}`,
  );
  return mapWhiteboard(response.data);
}

export async function addWhiteboardMembersApi(
  id: string,
  members: { userId: string; role: WhiteboardRole }[],
) {
  const response = await apiClient.post<ApiWhiteboard>(
    `/api/whiteboards/${id}/members`,
    { members },
  );
  return mapWhiteboard(response.data);
}

export async function updateWhiteboardMemberApi(
  id: string,
  userId: string,
  role: WhiteboardRole,
) {
  const response = await apiClient.patch<ApiWhiteboard>(
    `/api/whiteboards/${id}/members/${userId}`,
    { role },
  );
  return mapWhiteboard(response.data);
}

export async function deleteWhiteboardMemberApi(id: string, userId: string) {
  const response = await apiClient.delete<ApiWhiteboard>(
    `/api/whiteboards/${id}/members/${userId}`,
  );
  return mapWhiteboard(response.data);
}

export async function deleteWhiteboardApi(id: string) {
  const response = await apiClient.delete<{ success: boolean }>(
    `/api/whiteboards/${id}`,
  );
  return response.data;
}

export async function uploadWhiteboardPageSnapshotApi(
  id: string,
  pageId: string,
  file: { uri: string; name: string; type: string },
  width: number,
  height: number,
) {
  const uri =
    file.uri.startsWith("file://") || file.uri.startsWith("content://")
      ? file.uri
      : `file://${file.uri}`;
  const form = new FormData();
  form.append("file", {
    uri,
    name: file.name || "snapshot.png",
    type: file.type || "image/png",
  } as never);
  form.append("width", String(width));
  form.append("height", String(height));
  const response = await apiClient.put<WhiteboardSnapshot>(
    `/api/whiteboards/${id}/pages/${pageId}/snapshots`,
    form,
    {
      timeout: 60_000,
      transformRequest: (data, headers) => {
        if (headers) {
          if (typeof headers.delete === "function") {
            headers.delete("Content-Type");
          } else {
            delete (headers as { "Content-Type"?: string })["Content-Type"];
          }
        }
        return data;
      },
    },
  );
  return response.data;
}

export async function uploadWhiteboardSnapshotApi(
  id: string,
  file: { uri: string; name: string; type: string },
  width: number,
  height: number,
) {
  const uri =
    file.uri.startsWith("file://") || file.uri.startsWith("content://")
      ? file.uri
      : `file://${file.uri}`;
  const form = new FormData();
  form.append("file", {
    uri,
    name: file.name || "snapshot.png",
    type: file.type || "image/png",
  } as never);
  form.append("width", String(width));
  form.append("height", String(height));
  const response = await apiClient.put<WhiteboardSnapshot>(
    `/api/whiteboards/${id}/snapshots`,
    form,
    {
      timeout: 60_000,
      transformRequest: (data, headers) => {
        if (headers) {
          if (typeof headers.delete === "function") {
            headers.delete("Content-Type");
          } else {
            delete (headers as { "Content-Type"?: string })["Content-Type"];
          }
        }
        return data;
      },
    },
  );
  return response.data;
}
