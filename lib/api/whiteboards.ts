import { apiFetch } from "@/lib/api/client";
import { normalizeDocument } from "@/lib/whiteboard/document";
import type {
  Whiteboard,
  WhiteboardDocument,
  WhiteboardMember,
  WhiteboardOps,
  WhiteboardOpsAck,
  WhiteboardPage,
  WhiteboardRole,
  WhiteboardSnapshot,
} from "@/lib/whiteboard/types";
import { emptyWhiteboardDocument } from "@/lib/whiteboard/types";

export type ApiWhiteboardMember = {
  userId: string;
  role: WhiteboardRole;
  fullName: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  roleTitle?: string | null;
};

export type ApiWhiteboardLastEditor = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  username?: string | null;
};

export type ApiWhiteboardPage = {
  id: string;
  index: number;
  version: number;
  documentJson?: unknown;
  snapshot?: WhiteboardSnapshot | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ApiWhiteboard = {
  id: string;
  title: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string | null;
  lastEditedBy?: ApiWhiteboardLastEditor | null;
  autoSaveSnapshotOnExit?: boolean;
  duplicatedFromId?: string | null;
  myRole?: WhiteboardRole | null;
  members?: ApiWhiteboardMember[];
  pages?: ApiWhiteboardPage[];
  snapshot?: WhiteboardSnapshot | null;
};

function mapMember(row: ApiWhiteboardMember): WhiteboardMember {
  return {
    userId: row.userId,
    role: row.role,
    fullName: row.fullName ?? "",
    email: row.email ?? "",
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
    autoSaveSnapshotOnExit: Boolean(row.autoSaveSnapshotOnExit),
    duplicatedFromId: row.duplicatedFromId ?? null,
    myRole: row.myRole ?? null,
    members: (row.members ?? []).map(mapMember),
    pages,
    snapshot: row.snapshot ?? pages.find((page) => page.snapshot)?.snapshot ?? null,
  };
}

export async function listWhiteboardsApi() {
  const data = await apiFetch<ApiWhiteboard[] | { data?: ApiWhiteboard[] }>(
    "/api/whiteboards",
  );
  const rows = Array.isArray(data) ? data : (data.data ?? []);
  return rows.map(mapWhiteboard);
}

export async function listProjectWhiteboardsApi(projectId: string) {
  const rows = await apiFetch<ApiWhiteboard[]>(
    `/api/projects/${projectId}/whiteboards`,
  );
  return rows.map(mapWhiteboard);
}

export async function getWhiteboardApi(id: string) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}`);
  return mapWhiteboard(row);
}

export async function createWhiteboardApi(input: {
  title?: string;
  projectId?: string;
}) {
  const row = await apiFetch<ApiWhiteboard>("/api/whiteboards", {
    method: "POST",
    body: JSON.stringify({
      ...(input.title ? { title: input.title } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    }),
  });
  return mapWhiteboard(row);
}

export async function duplicateWhiteboardApi(id: string) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}/duplicate`, {
    method: "POST",
  });
  return mapWhiteboard(row);
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
  return apiFetch<WhiteboardActivity[]>(`/api/whiteboards/${id}/activity`);
}

export type WhiteboardComment = {
  id: string;
  content: string;
  pageId: string | null;
  x: number | null;
  y: number | null;
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
  return apiFetch<WhiteboardComment[]>(`/api/whiteboards/${id}/comments`);
}

export async function createWhiteboardCommentApi(
  id: string,
  input: { content: string; pageId?: string },
) {
  return apiFetch<WhiteboardComment>(`/api/whiteboards/${id}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteWhiteboardCommentApi(id: string, commentId: string) {
  return apiFetch<{ success: boolean }>(
    `/api/whiteboards/${id}/comments/${commentId}`,
    { method: "DELETE" },
  );
}

export async function createWhiteboardInviteApi(
  id: string,
  role: WhiteboardRole,
) {
  return apiFetch<{ token: string; role: WhiteboardRole; url: string }>(
    `/api/whiteboards/${id}/invites`,
    {
      method: "POST",
      body: JSON.stringify({ role }),
    },
  );
}

export async function getWhiteboardInviteApi(token: string) {
  return apiFetch<{
    token: string;
    role: WhiteboardRole;
    title: string;
    projectId: string | null;
  }>(`/api/whiteboard-invites/${token}`);
}

export async function acceptWhiteboardInviteApi(token: string) {
  const row = await apiFetch<ApiWhiteboard>(
    `/api/whiteboard-invites/${token}/accept`,
    { method: "POST" },
  );
  return mapWhiteboard(row);
}

export async function downloadWhiteboardExportApi(
  id: string,
  format: "pdf" | "zip" | "png",
  pageIds?: string[],
) {
  const { getAccessToken, apiUrl, ApiError } = await import("@/lib/api/client");
  const axios = (await import("axios")).default;
  const token = getAccessToken();
  const params = new URLSearchParams();
  if (pageIds?.length) params.set("pageIds", pageIds.join(","));
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await axios.request<Blob>({
    url: apiUrl(`/api/whiteboards/${id}/export/${format}${query}`),
    method: "GET",
    responseType: "blob",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError("Could not export the board", response.status);
  }
  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob: response.data,
    filename: match?.[1] ?? `whiteboard.${format}`,
  };
}

export async function applyWhiteboardOpsApi(id: string, ops: WhiteboardOps) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}/ops`, {
    method: "POST",
    body: JSON.stringify(ops),
  });
  return mapWhiteboard(row);
}

export async function applyWhiteboardPageOpsApi(
  id: string,
  pageId: string,
  ops: WhiteboardOps,
) {
  return apiFetch<WhiteboardOpsAck>(
    `/api/whiteboards/${id}/pages/${pageId}/ops`,
    {
      method: "POST",
      body: JSON.stringify(ops),
    },
  );
}

export async function addWhiteboardPageApi(id: string) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}/pages`, {
    method: "POST",
  });
  return mapWhiteboard(row);
}

export async function deleteWhiteboardPageApi(id: string, pageId: string) {
  const row = await apiFetch<ApiWhiteboard>(
    `/api/whiteboards/${id}/pages/${pageId}`,
    { method: "DELETE" },
  );
  return mapWhiteboard(row);
}

export async function addWhiteboardMembersApi(
  id: string,
  members: { userId: string; role: WhiteboardRole }[],
) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}/members`, {
    method: "POST",
    body: JSON.stringify({ members }),
  });
  return mapWhiteboard(row);
}

export async function updateWhiteboardMemberApi(
  id: string,
  userId: string,
  role: WhiteboardRole,
) {
  const row = await apiFetch<ApiWhiteboard>(
    `/api/whiteboards/${id}/members/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
  return mapWhiteboard(row);
}

export async function deleteWhiteboardMemberApi(id: string, userId: string) {
  const row = await apiFetch<ApiWhiteboard>(
    `/api/whiteboards/${id}/members/${userId}`,
    { method: "DELETE" },
  );
  return mapWhiteboard(row);
}

export async function deleteWhiteboardApi(id: string) {
  return apiFetch<{ success: boolean }>(`/api/whiteboards/${id}`, {
    method: "DELETE",
  });
}

export async function uploadWhiteboardPageSnapshotApi(
  id: string,
  pageId: string,
  blob: Blob,
  width: number,
  height: number,
) {
  const form = new FormData();
  form.append("file", blob, "snapshot.png");
  form.append("width", String(width));
  form.append("height", String(height));
  return apiFetch<WhiteboardSnapshot>(
    `/api/whiteboards/${id}/pages/${pageId}/snapshots`,
    {
      method: "PUT",
      body: form,
    },
  );
}

export async function patchWhiteboardApi(
  id: string,
  input: { title?: string; autoSaveSnapshotOnExit?: boolean },
) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return mapWhiteboard(row);
}

export async function updateWhiteboardApi(
  id: string,
  input: {
    documentJson: WhiteboardDocument;
    version: number;
    title?: string;
  },
) {
  const row = await apiFetch<ApiWhiteboard>(`/api/whiteboards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return mapWhiteboard(row);
}
