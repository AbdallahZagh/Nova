import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  addWhiteboardPageApi,
  applyHistory,
  applyOpsLocally,
  applyWhiteboardOpsApi,
  applyWhiteboardPageOpsApi,
  canDrawOnBoard,
  canExportBoard,
  canManageBoard,
  canSaveBoardImage,
  deleteWhiteboardPageApi,
  emptyWhiteboardDocument,
  getWhiteboardApi,
  invertHistory,
  mergeDocuments,
  presenceColorForUser,
  presenceSessionKey,
  uploadWhiteboardPageSnapshotApi,
  type HistoryEntry,
  type PresencePlatform,
  type Stroke,
  type StrokeTool,
  type Whiteboard,
  type WhiteboardDocument,
  type WhiteboardOps,
  type WhiteboardPresence,
} from "@/api/whiteboards";
import { useAuthStore } from "@/store/useAuthStore";
import {
  subscribeWhiteboardRealtime,
  type WhiteboardChannel,
} from "@/whiteboard/sync-channel";
import { compactOps, mergePending, SELF_PLATFORM } from "@/whiteboard/sync-ops";
import {
  readWhiteboardSession,
  writeWhiteboardSession,
  type HistoryByPage,
  type PendingByPage,
} from "@/whiteboard/pendingStore";

export type { WhiteboardPresence };

type SaveState = "idle" | "saving" | "saved" | "error";

export function useWhiteboardSync(whiteboardId: string) {
  const user = useAuthStore((state) => state.user);
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
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const flushAgainRef = useRef(false);
  const channelRef = useRef<WhiteboardChannel | null>(null);
  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const selfIdRef = useRef<string | null>(null);
  const drawingClearRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  documentRef.current = boardDoc;
  pageIdRef.current = pageId;
  selfIdRef.current = user?.id ?? null;

  const selfKey = user ? presenceSessionKey(user.id, SELF_PLATFORM) : null;
  const myRole = board?.myRole ?? null;
  const canDraw = canDrawOnBoard(myRole);
  const canSaveImage = canSaveBoardImage(myRole);
  const canManage = canManageBoard(myRole);
  const canExport = canExportBoard(myRole);

  const persistPending = useCallback(() => {
    const currentPageId = pageIdRef.current;
    if (currentPageId) {
      undoByPageRef.current[currentPageId] = undoRef.current;
      redoByPageRef.current[currentPageId] = redoRef.current;
    }
    void writeWhiteboardSession(whiteboardId, {
      pending: pendingByPageRef.current,
      undo: undoByPageRef.current,
      redo: redoByPageRef.current,
    });
  }, [whiteboardId]);

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const adoptBoard = useCallback((row: Whiteboard, keepPageId?: string | null) => {
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
  }, []);

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
        if (prev) clearTimeout(prev);
        drawingClearRef.current[key] = setTimeout(() => {
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

  const applyPageDoc = useCallback((targetPageId: string, ops: WhiteboardOps) => {
    const current = pagesDocRef.current[targetPageId] ?? emptyWhiteboardDocument();
    const next = applyOpsLocally(current, ops);
    pagesDocRef.current[targetPageId] = next;
    if (pageIdRef.current === targetPageId) setBoardDoc(next);
  }, []);

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
            const ack = await applyWhiteboardPageOpsApi(
              whiteboardId,
              targetPageId,
              ops,
            );
            persistPending();
            setBoard((current) =>
              current
                ? {
                    ...current,
                    pages: current.pages.map((page) =>
                      page.id === targetPageId
                        ? { ...page, version: ack.version }
                        : page,
                    ),
                  }
                : current,
            );
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
  }, [persistPending, whiteboardId]);

  const queueOps = useCallback(
    (ops: WhiteboardOps) => {
      const targetPageId = pageIdRef.current;
      if (!targetPageId) return;
      pendingByPageRef.current[targetPageId] = mergePending(
        pendingByPageRef.current[targetPageId] ?? {},
        ops,
      );
      persistPending();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void flushOps();
      }, 800);
    },
    [flushOps, persistPending],
  );

  const applyLocal = useCallback(
    (ops: WhiteboardOps, history?: HistoryEntry) => {
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
      queueOps(ops);
    },
    [applyPageDoc, queueOps, refreshHistoryFlags, sendBroadcast],
  );

  const saveSnapshot = useCallback(
    async (file: { uri: string; name: string; type: string }) => {
      await flushOps();
      const currentPageId = pageIdRef.current;
      if (!currentPageId) return null;
      const doc = pagesDocRef.current[currentPageId] ?? documentRef.current;
      const snapshot = await uploadWhiteboardPageSnapshotApi(
        whiteboardId,
        currentPageId,
        file,
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    undoRef.current = [];
    redoRef.current = [];
    pagesDocRef.current = {};
    void readWhiteboardSession(whiteboardId).then((session) => {
      if (cancelled) return;
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
    });
    return () => {
      cancelled = true;
    };
  }, [adoptBoard, flushOps, refreshHistoryFlags, whiteboardId]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeWhiteboardRealtime({
      whiteboardId,
      selfKey,
      profile: { id: user.id, name: user.fullName },
      pageIdRef,
      pagesDocRef,
      undoRef,
      redoRef,
      undoByPageRef,
      redoByPageRef,
      channelRef,
      markDrawing,
      applyPageDoc,
      persistPending,
      refreshHistoryFlags,
      setRemoteDrafts,
      setPresence,
      setBoard,
      setPageId,
      setBoardDoc,
    });
  }, [
    applyPageDoc,
    markDrawing,
    persistPending,
    refreshHistoryFlags,
    selfKey,
    user?.fullName,
    user?.id,
    whiteboardId,
  ]);


  useEffect(() => {
    const sub = AppState.addEventListener("change", () => {
      persistPending();
      void flushOps();
    });
    return () => {
      sub.remove();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
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
      if (!user) return;
      sendBroadcast("cursor", {
        userId: user.id,
        name: user.fullName,
        color: presenceColorForUser(user.id),
        platform: SELF_PLATFORM,
        x: x ?? null,
        y: y ?? null,
      });
    },
    [sendBroadcast, user],
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
    queueOps(ops);
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
    queueOps(ops);
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

  const rename = useCallback(
    async (title: string) => {
      const updated = await applyWhiteboardOpsApi(whiteboardId, { title });
      adoptBoard(updated, pageIdRef.current);
    },
    [adoptBoard, whiteboardId],
  );

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
      setBoardDoc(pagesDocRef.current[nextPageId] ?? emptyWhiteboardDocument());
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

  const people = useMemo<WhiteboardPresence[]>(() => {
    if (!user) return presence;
    return [
      {
        userId: user.id,
        name: user.fullName,
        color: presenceColorForUser(user.id),
        platform: SELF_PLATFORM,
        drawing: selfDrawing,
        isSelf: true,
      },
      ...presence,
    ];
  }, [presence, selfDrawing, user]);

  const remoteDraftList = useMemo(() => Object.values(remoteDrafts), [remoteDrafts]);

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
    remoteDrafts: remoteDraftList,
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
  };
}
