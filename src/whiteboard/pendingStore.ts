import type { HistoryEntry, WhiteboardOps } from "@/api/whiteboards";

export type PendingByPage = Record<string, WhiteboardOps>;
export type HistoryByPage = Record<string, HistoryEntry[]>;

export type WhiteboardSession = {
  pending: PendingByPage;
  undo: HistoryByPage;
  redo: HistoryByPage;
};

const HISTORY_CAP = 80;

function isEmptyOps(ops?: WhiteboardOps) {
  if (!ops) return true;
  return !(
    (ops.addedStrokes?.length ?? 0) > 0 ||
    (ops.removedStrokeIds?.length ?? 0) > 0 ||
    ops.title !== undefined
  );
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as HistoryEntry;
  if (entry.type === "add") {
    return Boolean(entry.stroke?.id && Array.isArray(entry.stroke.points));
  }
  if (entry.type === "remove") {
    return Array.isArray(entry.strokes);
  }
  return false;
}

function capHistory(entries: HistoryEntry[]) {
  return entries.length > HISTORY_CAP
    ? entries.slice(entries.length - HISTORY_CAP)
    : entries;
}

function parseHistory(raw: unknown): HistoryByPage {
  if (!raw || typeof raw !== "object") return {};
  const next: HistoryByPage = {};
  for (const [pageId, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    next[pageId] = capHistory(entries.filter(isHistoryEntry));
  }
  return next;
}

function filePath(
  FileSystem: typeof import("expo-file-system/legacy"),
  whiteboardId: string,
) {
  return `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}wb-pending-${whiteboardId}.json`;
}

export function emptyWhiteboardSession(): WhiteboardSession {
  return { pending: {}, undo: {}, redo: {} };
}

export async function readWhiteboardSession(
  whiteboardId: string,
): Promise<WhiteboardSession> {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const path = filePath(FileSystem, whiteboardId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return emptyWhiteboardSession();
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as WhiteboardSession | PendingByPage;
    if (
      parsed &&
      typeof parsed === "object" &&
      "pending" in parsed &&
      parsed.pending &&
      typeof parsed.pending === "object"
    ) {
      return {
        pending: parsed.pending,
        undo: parseHistory((parsed as WhiteboardSession).undo),
        redo: parseHistory((parsed as WhiteboardSession).redo),
      };
    }
    if (parsed && typeof parsed === "object") {
      return { pending: parsed as PendingByPage, undo: {}, redo: {} };
    }
    return emptyWhiteboardSession();
  } catch {
    return emptyWhiteboardSession();
  }
}

export async function readPendingOps(whiteboardId: string): Promise<PendingByPage> {
  return (await readWhiteboardSession(whiteboardId)).pending;
}

export async function writeWhiteboardSession(
  whiteboardId: string,
  session: WhiteboardSession,
) {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const path = filePath(FileSystem, whiteboardId);
    const pending: PendingByPage = {};
    for (const [pageId, ops] of Object.entries(session.pending)) {
      if (!isEmptyOps(ops)) pending[pageId] = ops;
    }
    const undo: HistoryByPage = {};
    const redo: HistoryByPage = {};
    for (const [pageId, entries] of Object.entries(session.undo)) {
      const next = capHistory(entries.filter(isHistoryEntry));
      if (next.length) undo[pageId] = next;
    }
    for (const [pageId, entries] of Object.entries(session.redo)) {
      const next = capHistory(entries.filter(isHistoryEntry));
      if (next.length) redo[pageId] = next;
    }
    if (
      Object.keys(pending).length === 0 &&
      Object.keys(undo).length === 0 &&
      Object.keys(redo).length === 0
    ) {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(
      path,
      JSON.stringify({ pending, undo, redo }),
    );
  } catch {
    // In-memory session still works if disk write fails.
  }
}

export async function writePendingOps(
  whiteboardId: string,
  pending: PendingByPage,
) {
  const current = await readWhiteboardSession(whiteboardId);
  await writeWhiteboardSession(whiteboardId, { ...current, pending });
}
