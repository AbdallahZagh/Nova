"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import {
  addWhiteboardPageApi,
  applyWhiteboardOpsApi,
  applyWhiteboardPageOpsApi,
  deleteWhiteboardPageApi,
  getWhiteboardApi,
  uploadWhiteboardPageSnapshotApi,
} from "@/lib/api/whiteboards";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";
import {
  applyHistory,
  applyOpsLocally,
  invertHistory,
  mergeDocuments,
  type HistoryEntry,
} from "@/lib/whiteboard/document";
import { exportDocumentPng } from "@/lib/whiteboard/render";
import {
  canDrawOnBoard,
  canExportBoard,
  canManageBoard,
  canSaveBoardImage,
  emptyWhiteboardDocument,
  presenceColorForUser,
  presenceSessionKey,
  type PresencePlatform,
  type Stroke,
  type StrokeTool,
  type Whiteboard,
  type WhiteboardDocument,
  type WhiteboardOps,
  type WhiteboardPage,
  type WhiteboardPresence,
} from "@/lib/whiteboard/types";
import {
  readWhiteboardSession,
  writeWhiteboardSession,
  type HistoryByPage,
  type PendingByPage,
} from "@/lib/whiteboard/pendingStore";

const SELF_PLATFORM: PresencePlatform = "web";

function unwrapStroke(
  payload: unknown,
): { userId?: string; platform?: PresencePlatform; pageId?: string; stroke: Stroke } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as {
    userId?: string;
    platform?: PresencePlatform;
    pageId?: string;
    stroke?: Stroke;
    id?: string;
    points?: unknown;
  };
  if (value.stroke?.id && Array.isArray(value.stroke.points)) {
    return {
      userId: value.userId,
      platform: value.platform,
      pageId: value.pageId,
      stroke: value.stroke,
    };
  }
  if (value.id && Array.isArray(value.points)) {
    return { userId: value.userId, stroke: value as Stroke };
  }
  return null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function compactOps(ops: WhiteboardOps): WhiteboardOps | null {
  const removed = new Set(ops.removedStrokeIds ?? []);
  const added = (ops.addedStrokes ?? []).filter((stroke) => {
    if (!removed.has(stroke.id)) return true;
    removed.delete(stroke.id);
    return false;
  });
  const next: WhiteboardOps = {};
  if (added.length) next.addedStrokes = added;
  if (removed.size) next.removedStrokeIds = [...removed];
  if (ops.addedRegions?.length) next.addedRegions = ops.addedRegions;
  if (ops.removedRegionIds?.length) next.removedRegionIds = ops.removedRegionIds;
  if (ops.canvas) next.canvas = ops.canvas;
  if (ops.title !== undefined) next.title = ops.title;
  return Object.keys(next).length ? next : null;
}

function mergePending(current: WhiteboardOps, incoming: WhiteboardOps): WhiteboardOps {
  return {
    addedStrokes: [...(current.addedStrokes ?? []), ...(incoming.addedStrokes ?? [])],
    removedStrokeIds: [
      ...(current.removedStrokeIds ?? []),
      ...(incoming.removedStrokeIds ?? []),
    ],
    addedRegions: [...(current.addedRegions ?? []), ...(incoming.addedRegions ?? [])],
    removedRegionIds: [
      ...(current.removedRegionIds ?? []),
      ...(incoming.removedRegionIds ?? []),
    ],
    canvas: incoming.canvas ?? current.canvas,
    title: incoming.title ?? current.title,
  };
}

export function useWhiteboardSync(whiteboardId: string) {
  const { profile } = useUser();
  const [board, setBoard] = useState<Whiteboard | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [boardDoc, setBoardDoc] = useState<WhiteboardDocument>(
    emptyWhiteboardDocument(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [color, setColor] = useState("#e8e3e0");
  const [width, setWidth] = useState(4);
  const [presence, setPresence] = useState<WhiteboardPresence[]>([]);
  const [selfDrawing, setSelfDrawing] = useState(false);
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, Stroke>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const documentRef = useRef(boardDoc);
  const pageIdRef = useRef<string | null>(null);
  const pagesDocRef = useRef<Record<string, WhiteboardDocument>>({});
  const pendingByPageRef = useRef<PendingByPage>({});
  const undoByPageRef = useRef<HistoryByPage>({});
  const redoByPageRef = useRef<HistoryByPage>({});
  const persistTimerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const flushAgainRef = useRef(false);
  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof getSupabaseRealtimeClient>>["channel"]
  > | null>(null);
  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const selfIdRef = useRef<string | null>(null);
  const drawingClearRef = useRef<Record<string, number>>({});

  documentRef.current = boardDoc;
  pageIdRef.current = pageId;
  selfIdRef.current = profile?.id ?? null;

  const selfKey = profile
    ? presenceSessionKey(profile.id, SELF_PLATFORM)
    : null;
  const myRole = board?.myRole ?? null;
  const canDraw = canDrawOnBoard(myRole);
  const canSaveImage = canSaveBoardImage(myRole);
  const canManage = canManageBoard(myRole);
  const canExport = canExportBoard(myRole);

  const persistPending = useCallback(() => {
    const pageId = pageIdRef.current;
    if (pageId) {
      undoByPageRef.current[pageId] = undoRef.current;
      redoByPageRef.current[pageId] = redoRef.current;
    }
    writeWhiteboardSession(whiteboardId, {
      pending: pendingByPageRef.current,
      undo: undoByPageRef.current,
      redo: redoByPageRef.current,
    });
  }, [whiteboardId]);

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const adoptBoard = useCallback(
    (row: Whiteboard, keepPageId?: string | null) => {
      setBoard(row);
      const nextDocs: Record<string, WhiteboardDocument> = {};
      for (const page of row.pages) {
        const server = page.documentJson;
        const local = pagesDocRef.current[page.id];
        let merged = local ? mergeDocuments(server, local) : server;
        const pending = pendingByPageRef.current[page.id];
        if (pending) merged = applyOpsLocally(merged, pending);
        nextDocs[page.id] = merged;
      }
      pagesDocRef.current = nextDocs;
      const nextPage =
        row.pages.find((page) => page.id === keepPageId) ??
        row.pages.find((page) => page.id === pageIdRef.current) ??
        row.pages[0] ??
        null;
      if (nextPage) {
        const doc = nextDocs[nextPage.id] ?? nextPage.documentJson;
        setPageId(nextPage.id);
        setBoardDoc(doc);
      }
    },
    [],
  );

  const markDrawing = useCallback(
    (userId: string, drawing: boolean, platform?: PresencePlatform) => {
      setPresence((current) =>
        current.map((peer) => {
          if (peer.userId !== userId) return peer;
          if (platform && peer.platform !== platform) return peer;
          return {
            ...peer,
            drawing,
            ...(drawing ? {} : { x: undefined, y: undefined }),
          };
        }),
      );
      const key = platform ? presenceSessionKey(userId, platform) : userId;
      if (drawing) {
        const prev = drawingClearRef.current[key];
        if (prev) window.clearTimeout(prev);
        drawingClearRef.current[key] = window.setTimeout(() => {
          setPresence((current) =>
            current.map((peer) => {
              if (peer.userId !== userId) return peer;
              if (platform && peer.platform !== platform) return peer;
              return { ...peer, drawing: false, x: undefined, y: undefined };
            }),
          );
        }, 900);
      }
    },
    [],
  );

  const sendBroadcast = useCallback((event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event, payload });
  }, []);

  const applyPageDoc = useCallback(
    (targetPageId: string, ops: WhiteboardOps) => {
      const current =
        pagesDocRef.current[targetPageId] ?? emptyWhiteboardDocument();
      const next = applyOpsLocally(current, ops);
      pagesDocRef.current[targetPageId] = next;
      if (pageIdRef.current === targetPageId) {
        setBoardDoc(next);
      }
    },
    [],
  );

  const flushOps = useCallback(async () => {
    if (flushingRef.current) {
      flushAgainRef.current = true;
      return;
    }
    flushingRef.current = true;
    setSaveState("saving");
    try {
      do {
        flushAgainRef.current = false;
        const pageIds = Object.keys(pendingByPageRef.current);
        for (const targetPageId of pageIds) {
          const ops = compactOps(pendingByPageRef.current[targetPageId] ?? {});
          if (!ops) {
            delete pendingByPageRef.current[targetPageId];
            persistPending();
            continue;
          }
          // Keep unacked ops on disk until the server confirms. In-memory
          // pending is cleared so strokes drawn during the request queue again.
          pendingByPageRef.current[targetPageId] = {};
          try {
            const updated = await applyWhiteboardPageOpsApi(
              whiteboardId,
              targetPageId,
              ops,
            );
            persistPending();
            adoptBoard(updated, pageIdRef.current);
          } catch {
            pendingByPageRef.current[targetPageId] = mergePending(
              ops,
              pendingByPageRef.current[targetPageId] ?? {},
            );
            persistPending();
            setSaveState("error");
            return;
          }
        }
      } while (
        flushAgainRef.current ||
        Object.values(pendingByPageRef.current).some((ops) => compactOps(ops))
      );
      setSaveState("saved");
    } finally {
      flushingRef.current = false;
    }
  }, [adoptBoard, persistPending, whiteboardId]);

  const queueOps = useCallback(
    (ops: WhiteboardOps, persist: boolean) => {
      const targetPageId = pageIdRef.current;
      if (!persist || !targetPageId) return;
      pendingByPageRef.current[targetPageId] = mergePending(
        pendingByPageRef.current[targetPageId] ?? {},
        ops,
      );
      persistPending();
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        void flushOps();
      }, 800);
    },
    [flushOps, persistPending],
  );

  const applyLocal = useCallback(
    (ops: WhiteboardOps, history?: HistoryEntry, persist = true) => {
      const currentPageId = pageIdRef.current;
      if (currentPageId) applyPageDoc(currentPageId, ops);
      else setBoardDoc((current) => applyOpsLocally(current, ops));
      if (history) {
        undoRef.current.push(history);
        redoRef.current = [];
        refreshHistoryFlags();
        sendBroadcast("history:push", {
          pageId: currentPageId,
          entry: history,
        });
      }
      queueOps(ops, persist);
    },
    [applyPageDoc, queueOps, refreshHistoryFlags, sendBroadcast],
  );

  const saveSnapshot = useCallback(
    async (paper: string, dark: boolean) => {
      await flushOps();
      const currentPageId = pageIdRef.current;
      if (!currentPageId) return null;
      const doc = pagesDocRef.current[currentPageId] ?? documentRef.current;
      const blob = await exportDocumentPng(doc, { paper, dark });
      const snapshot = await uploadWhiteboardPageSnapshotApi(
        whiteboardId,
        currentPageId,
        blob,
        doc.canvas.width,
        doc.canvas.height,
      );
      setBoard((current) =>
        current
          ? {
              ...current,
              snapshot,
              pages: current.pages.map((page) =>
                page.id === currentPageId ? { ...page, snapshot } : page,
              ),
            }
          : current,
      );
      return snapshot;
    },
    [flushOps, whiteboardId],
  );

  const saveAllSnapshots = useCallback(
    async (paper: string, dark: boolean) => {
      await flushOps();
      const pages = board?.pages ?? [];
      let cover = board?.snapshot ?? null;
      for (const page of pages) {
        const doc = pagesDocRef.current[page.id] ?? page.documentJson;
        const blob = await exportDocumentPng(doc, { paper, dark });
        const snapshot = await uploadWhiteboardPageSnapshotApi(
          whiteboardId,
          page.id,
          blob,
          doc.canvas.width,
          doc.canvas.height,
        );
        if (page.id === pages[0]?.id) cover = snapshot;
        setBoard((current) =>
          current
            ? {
                ...current,
                snapshot: page.id === current.pages[0]?.id ? snapshot : current.snapshot,
                pages: current.pages.map((item) =>
                  item.id === page.id ? { ...item, snapshot } : item,
                ),
              }
            : current,
        );
      }
      return cover;
    },
    [board?.pages, board?.snapshot, flushOps, whiteboardId],
  );

  const saveSnapshotsForPages = useCallback(
    async (pageIds: string[], paper: string, dark: boolean) => {
      await flushOps();
      for (const targetPageId of pageIds) {
        const page = board?.pages.find((item) => item.id === targetPageId);
        const doc =
          pagesDocRef.current[targetPageId] ??
          page?.documentJson ??
          emptyWhiteboardDocument();
        const blob = await exportDocumentPng(doc, { paper, dark });
        const snapshot = await uploadWhiteboardPageSnapshotApi(
          whiteboardId,
          targetPageId,
          blob,
          doc.canvas.width,
          doc.canvas.height,
        );
        setBoard((current) =>
          current
            ? {
                ...current,
                snapshot:
                  targetPageId === current.pages[0]?.id
                    ? snapshot
                    : current.snapshot,
                pages: current.pages.map((item) =>
                  item.id === targetPageId ? { ...item, snapshot } : item,
                ),
              }
            : current,
        );
      }
    },
    [board?.pages, flushOps, whiteboardId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    undoRef.current = [];
    redoRef.current = [];
    pagesDocRef.current = {};
    const session = readWhiteboardSession(whiteboardId);
    pendingByPageRef.current = session.pending;
    undoByPageRef.current = session.undo;
    redoByPageRef.current = session.redo;

    void getWhiteboardApi(whiteboardId)
      .then((row) => {
        if (cancelled) return;
        adoptBoard(row);
        const current = pageIdRef.current;
        if (current) {
          undoRef.current = undoByPageRef.current[current] ?? [];
          redoRef.current = redoByPageRef.current[current] ?? [];
        }
        setLoading(false);
        refreshHistoryFlags();
        void flushOps();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load whiteboard");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adoptBoard, flushOps, refreshHistoryFlags, whiteboardId]);

  useEffect(() => {
    const supabase = getSupabaseRealtimeClient();
    if (!supabase || !profile?.id) return;

    const color = presenceColorForUser(profile.id);
    const channel = supabase.channel(`whiteboard:${whiteboardId}`, {
      config: {
        presence: { key: presenceSessionKey(profile.id, SELF_PLATFORM) },
        broadcast: { self: false },
      },
    });

    channel
      .on("broadcast", { event: "stroke:add" }, ({ payload }) => {
        const parsed = unwrapStroke(payload);
        if (!parsed) return;
        const { stroke, userId, platform } = parsed;
        if (userId) markDrawing(userId, false, platform);
        const targetPageId = parsed.pageId ?? pageIdRef.current;
        setRemoteDrafts((current) => {
          const next = { ...current };
          delete next[stroke.id];
          return next;
        });
        if (targetPageId) applyPageDoc(targetPageId, { addedStrokes: [stroke] });
      })
      .on("broadcast", { event: "history:push" }, ({ payload }) => {
        const body = payload as { pageId?: string; entry?: HistoryEntry };
        if (!body.entry || !body.pageId) return;
        if (body.pageId === pageIdRef.current) {
          undoRef.current = [...undoRef.current, body.entry];
          redoRef.current = [];
          refreshHistoryFlags();
        } else {
          undoByPageRef.current[body.pageId] = [
            ...(undoByPageRef.current[body.pageId] ?? []),
            body.entry,
          ];
          redoByPageRef.current[body.pageId] = [];
        }
        persistPending();
      })
      .on("broadcast", { event: "history:undo" }, ({ payload }) => {
        const pageId = (payload as { pageId?: string }).pageId ?? pageIdRef.current;
        if (!pageId) return;
        if (pageId === pageIdRef.current) {
          const entry = undoRef.current.pop();
          if (entry) redoRef.current.push(entry);
          refreshHistoryFlags();
        } else {
          const stack = [...(undoByPageRef.current[pageId] ?? [])];
          const entry = stack.pop();
          if (entry) {
            undoByPageRef.current[pageId] = stack;
            redoByPageRef.current[pageId] = [
              ...(redoByPageRef.current[pageId] ?? []),
              entry,
            ];
          }
        }
        persistPending();
      })
      .on("broadcast", { event: "history:redo" }, ({ payload }) => {
        const pageId = (payload as { pageId?: string }).pageId ?? pageIdRef.current;
        if (!pageId) return;
        if (pageId === pageIdRef.current) {
          const entry = redoRef.current.pop();
          if (entry) undoRef.current.push(entry);
          refreshHistoryFlags();
        } else {
          const stack = [...(redoByPageRef.current[pageId] ?? [])];
          const entry = stack.pop();
          if (entry) {
            redoByPageRef.current[pageId] = stack;
            undoByPageRef.current[pageId] = [
              ...(undoByPageRef.current[pageId] ?? []),
              entry,
            ];
          }
        }
        persistPending();
      })
      .on("broadcast", { event: "stroke:remove" }, ({ payload }) => {
        const body = payload as { ids?: string[]; pageId?: string };
        const ids = body.ids ?? [];
        if (!ids.length) return;
        applyPageDoc(body.pageId ?? pageIdRef.current ?? "", {
          removedStrokeIds: ids,
        });
      })
      .on("broadcast", { event: "stroke:draft" }, ({ payload }) => {
        const parsed = unwrapStroke(payload);
        if (!parsed) return;
        if (parsed.userId) markDrawing(parsed.userId, true, parsed.platform);
        if (parsed.pageId && parsed.pageId !== pageIdRef.current) return;
        setRemoteDrafts((current) => ({
          ...current,
          [parsed.stroke.id]: parsed.stroke,
        }));
      })
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const cursor = payload as WhiteboardPresence;
        if (!cursor?.userId) return;
        const key = presenceSessionKey(
          cursor.userId,
          cursor.platform ?? "web",
        );
        if (key === selfKey) return;
        setPresence((current) =>
          current.map((peer) =>
            peer.userId === cursor.userId &&
            peer.platform === (cursor.platform ?? peer.platform)
              ? {
                  ...peer,
                  x: cursor.x,
                  y: cursor.y,
                  drawing: cursor.x != null && cursor.y != null,
                  platform: cursor.platform ?? peer.platform,
                }
              : peer,
          ),
        );
      })
      .on("broadcast", { event: "page:add" }, ({ payload }) => {
        const page = payload as WhiteboardPage | undefined;
        if (!page?.id) return;
        pagesDocRef.current[page.id] =
          page.documentJson ?? emptyWhiteboardDocument();
        setBoard((current) => {
          if (!current || current.pages.some((item) => item.id === page.id)) {
            return current;
          }
          return {
            ...current,
            pages: [...current.pages, page].sort((a, b) => a.index - b.index),
          };
        });
      })
      .on("broadcast", { event: "page:remove" }, ({ payload }) => {
        const removedId = (payload as { pageId?: string }).pageId;
        if (!removedId) return;
        delete pagesDocRef.current[removedId];
        setBoard((current) => {
          if (!current) return current;
          const pages = current.pages.filter((page) => page.id !== removedId);
          if (pageIdRef.current === removedId && pages[0]) {
            setPageId(pages[0].id);
            setBoardDoc(
              pagesDocRef.current[pages[0].id] ?? pages[0].documentJson,
            );
          }
          return { ...current, pages };
        });
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<WhiteboardPresence>();
        setPresence((current) => {
          const drawingByKey = Object.fromEntries(
            current.map((peer) => [
              presenceSessionKey(peer.userId, peer.platform),
              peer.drawing,
            ]),
          );
          const peers: WhiteboardPresence[] = [];
          for (const key of Object.keys(state)) {
            const meta = state[key]?.[0];
            if (!meta?.userId) continue;
            const platform = meta.platform ?? "web";
            const session = presenceSessionKey(meta.userId, platform);
            if (session === selfKey) continue;
            peers.push({
              ...meta,
              platform,
              drawing: drawingByKey[session],
            });
          }
          return peers;
        });
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          userId: profile.id,
          name: profile.name,
          color,
          platform: SELF_PLATFORM,
        });
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [applyPageDoc, markDrawing, persistPending, profile?.id, profile?.name, refreshHistoryFlags, selfKey, whiteboardId]);

  useEffect(() => {
    const onHide = () => {
      persistPending();
      void flushOps();
    };
    const onOnline = () => {
      void flushOps();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    const onVisibility = () => {
      if (globalThis.document.visibilityState === "hidden") onHide();
    };
    globalThis.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      globalThis.document.removeEventListener("visibilitychange", onVisibility);
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistPending();
      void flushOps();
    };
  }, [flushOps, persistPending]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      if (!canDraw) return;
      setSelfDrawing(false);
      applyLocal({ addedStrokes: [stroke] }, { type: "add", stroke });
      sendBroadcast("stroke:add", {
        userId: selfIdRef.current,
        platform: SELF_PLATFORM,
        pageId: pageIdRef.current,
        stroke,
      });
      sendBroadcast("cursor", {
        userId: selfIdRef.current,
        platform: SELF_PLATFORM,
        x: null,
        y: null,
      });
    },
    [applyLocal, canDraw, sendBroadcast],
  );

  const broadcastDraft = useCallback(
    (stroke: Stroke | null) => {
      setSelfDrawing(Boolean(stroke));
      if (!stroke) {
        sendBroadcast("cursor", {
          userId: selfIdRef.current,
          platform: SELF_PLATFORM,
          x: null,
          y: null,
        });
        return;
      }
      sendBroadcast("stroke:draft", {
        userId: selfIdRef.current,
        platform: SELF_PLATFORM,
        pageId: pageIdRef.current,
        stroke,
      });
    },
    [sendBroadcast],
  );

  const broadcastCursor = useCallback(
    (x?: number, y?: number) => {
      if (!profile) return;
      sendBroadcast("cursor", {
        userId: profile.id,
        name: profile.name,
        color: presenceColorForUser(profile.id),
        platform: SELF_PLATFORM,
        x: x ?? null,
        y: y ?? null,
      });
    },
    [profile, sendBroadcast],
  );

  const undo = useCallback(() => {
    if (!canDraw) return;
    const entry = undoRef.current.pop();
    if (!entry) return;
    const ops = invertHistory(entry);
    applyPageDoc(pageIdRef.current ?? "", ops);
    redoRef.current.push(entry);
    refreshHistoryFlags();
    persistPending();
    queueOps(ops, true);
    sendBroadcast("history:undo", { pageId: pageIdRef.current });
    if (ops.addedStrokes) {
      for (const stroke of ops.addedStrokes) {
        sendBroadcast("stroke:add", {
          userId: selfIdRef.current,
          platform: SELF_PLATFORM,
          pageId: pageIdRef.current,
          stroke,
        });
      }
    }
    if (ops.removedStrokeIds) {
      sendBroadcast("stroke:remove", {
        ids: ops.removedStrokeIds,
        pageId: pageIdRef.current,
      });
    }
  }, [applyPageDoc, canDraw, persistPending, queueOps, refreshHistoryFlags, sendBroadcast]);

  const redo = useCallback(() => {
    if (!canDraw) return;
    const entry = redoRef.current.pop();
    if (!entry) return;
    const ops = applyHistory(entry);
    applyPageDoc(pageIdRef.current ?? "", ops);
    undoRef.current.push(entry);
    refreshHistoryFlags();
    persistPending();
    queueOps(ops, true);
    sendBroadcast("history:redo", { pageId: pageIdRef.current });
    if (ops.addedStrokes) {
      for (const stroke of ops.addedStrokes) {
        sendBroadcast("stroke:add", {
          userId: selfIdRef.current,
          platform: SELF_PLATFORM,
          pageId: pageIdRef.current,
          stroke,
        });
      }
    }
    if (ops.removedStrokeIds) {
      sendBroadcast("stroke:remove", {
        ids: ops.removedStrokeIds,
        pageId: pageIdRef.current,
      });
    }
  }, [applyPageDoc, canDraw, persistPending, queueOps, refreshHistoryFlags, sendBroadcast]);

  const clearBoard = useCallback(() => {
    if (!canDraw) return;
    const strokes = documentRef.current.strokes;
    if (!strokes.length) return;
    const ops = { removedStrokeIds: strokes.map((stroke) => stroke.id) };
    applyLocal(ops, { type: "remove", strokes });
    sendBroadcast("stroke:remove", {
      ids: ops.removedStrokeIds,
      pageId: pageIdRef.current,
    });
  }, [applyLocal, canDraw, sendBroadcast]);

  const rename = useCallback(async (nextTitle: string) => {
    const updated = await applyWhiteboardOpsApi(whiteboardId, { title: nextTitle });
    adoptBoard(updated, pageIdRef.current);
  }, [adoptBoard, whiteboardId]);

  const switchPage = useCallback(
    async (nextPageId: string) => {
      if (nextPageId === pageIdRef.current) return;
      await flushOps();
      const from = pageIdRef.current;
      if (from) {
        undoByPageRef.current[from] = undoRef.current;
        redoByPageRef.current[from] = redoRef.current;
      }
      undoRef.current = undoByPageRef.current[nextPageId] ?? [];
      redoRef.current = redoByPageRef.current[nextPageId] ?? [];
      refreshHistoryFlags();
      persistPending();
      setRemoteDrafts({});
      setPageId(nextPageId);
      setBoardDoc(
        pagesDocRef.current[nextPageId] ?? emptyWhiteboardDocument(),
      );
    },
    [flushOps, persistPending, refreshHistoryFlags],
  );

  const addPage = useCallback(async () => {
    if (!canDraw) return;
    await flushOps();
    const from = pageIdRef.current;
    if (from) {
      undoByPageRef.current[from] = undoRef.current;
      redoByPageRef.current[from] = redoRef.current;
    }
    const updated = await addWhiteboardPageApi(whiteboardId);
    const created = updated.pages.find(
      (page) => !board?.pages.some((item) => item.id === page.id),
    );
    adoptBoard(updated, created?.id ?? pageIdRef.current);
    if (created) sendBroadcast("page:add", created);
    undoRef.current = [];
    redoRef.current = [];
    refreshHistoryFlags();
    persistPending();
  }, [adoptBoard, board?.pages, canDraw, flushOps, persistPending, refreshHistoryFlags, sendBroadcast, whiteboardId]);

  const removePage = useCallback(
    async (targetPageId: string) => {
      if (!canManage) return;
      await flushOps();
      const updated = await deleteWhiteboardPageApi(whiteboardId, targetPageId);
      delete pagesDocRef.current[targetPageId];
      delete undoByPageRef.current[targetPageId];
      delete redoByPageRef.current[targetPageId];
      adoptBoard(updated);
      sendBroadcast("page:remove", { pageId: targetPageId });
      const nextId = pageIdRef.current;
      undoRef.current = nextId ? (undoByPageRef.current[nextId] ?? []) : [];
      redoRef.current = nextId ? (redoByPageRef.current[nextId] ?? []) : [];
      refreshHistoryFlags();
      persistPending();
    },
    [adoptBoard, canManage, flushOps, persistPending, refreshHistoryFlags, sendBroadcast, whiteboardId],
  );

  const people: WhiteboardPresence[] = profile
    ? [
        {
          userId: profile.id,
          name: profile.name,
          color: presenceColorForUser(profile.id),
          platform: SELF_PLATFORM,
          drawing: selfDrawing,
          isSelf: true,
        },
        ...presence,
      ]
    : presence;

  return {
    board,
    setBoard,
    document: boardDoc,
    pageId,
    pages: board?.pages ?? [],
    loading,
    error,
    saveState,
    tool,
    setTool,
    color,
    setColor,
    width,
    setWidth,
    presence,
    people,
    remoteDrafts: Object.values(remoteDrafts),
    canUndo,
    canRedo,
    canDraw,
    canSaveImage,
    canManage,
    canExport,
    myRole,
    addStroke,
    broadcastDraft,
    broadcastCursor,
    undo,
    redo,
    clearBoard,
    rename,
    switchPage,
    addPage,
    removePage,
    flushOps,
    saveSnapshot,
    saveAllSnapshots,
    saveSnapshotsForPages,
  };
}
