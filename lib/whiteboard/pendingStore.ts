import type { HistoryEntry } from "@/lib/whiteboard/document";
import type { WhiteboardOps } from "@/lib/whiteboard/types";

export type PendingByPage = Record<string, WhiteboardOps>;
export type HistoryByPage = Record<string, HistoryEntry[]>;

export type WhiteboardSession = {
  pending: PendingByPage;
  undo: HistoryByPage;
  redo: HistoryByPage;
};

const HISTORY_CAP = 80;

function storageKey(whiteboardId: string) {
  return `nova.whiteboard.pending.${whiteboardId}`;
}

function isEmptyOps(ops?: WhiteboardOps) {
  if (!ops) return true;
  return !(
    (ops.addedStrokes?.length ?? 0) > 0 ||
    (ops.removedStrokeIds?.length ?? 0) > 0 ||
    (ops.addedRegions?.length ?? 0) > 0 ||
    (ops.removedRegionIds?.length ?? 0) > 0 ||
    ops.canvas ||
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

export function emptyWhiteboardSession(): WhiteboardSession {
  return { pending: {}, undo: {}, redo: {} };
}

export function readWhiteboardSession(whiteboardId: string): WhiteboardSession {
  if (typeof localStorage === "undefined") return emptyWhiteboardSession();
  try {
    const raw = localStorage.getItem(storageKey(whiteboardId));
    if (!raw) return emptyWhiteboardSession();
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "pending" in parsed &&
      parsed.pending &&
      typeof parsed.pending === "object"
    ) {
      const session = parsed as WhiteboardSession;
      return {
        pending: session.pending,
        undo: parseHistory(session.undo),
        redo: parseHistory(session.redo),
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

export function readPendingOps(whiteboardId: string): PendingByPage {
  return readWhiteboardSession(whiteboardId).pending;
}

export function writeWhiteboardSession(
  whiteboardId: string,
  session: WhiteboardSession,
) {
  if (typeof localStorage === "undefined") return;
  try {
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
      localStorage.removeItem(storageKey(whiteboardId));
      return;
    }
    localStorage.setItem(
      storageKey(whiteboardId),
      JSON.stringify({ pending, undo, redo }),
    );
  } catch {
    // Ignore quota / private-mode failures; in-memory session still works.
  }
}

export function writePendingOps(whiteboardId: string, pending: PendingByPage) {
  const current = readWhiteboardSession(whiteboardId);
  writeWhiteboardSession(whiteboardId, { ...current, pending });
}
