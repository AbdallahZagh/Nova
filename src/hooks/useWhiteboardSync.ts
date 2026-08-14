import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import {
  addWhiteboardPageApi,
  applyHistory,
  applyOpsLocally,
  applyWhiteboardOpsApi,
  applyWhiteboardPageOpsApi,
  canDrawOnBoard,
  canManageBoard,
  canSaveBoardImage,
  deleteWhiteboardPageApi,
  emptyWhiteboardDocument,
  getWhiteboardApi,
  invertHistory,
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
  type WhiteboardPage,
} from "@/api/whiteboards";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/notifications";
import { useAuthStore } from "@/store/useAuthStore";

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

type SaveState = "idle" | "saving" | "saved" | "error";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const SELF_PLATFORM: PresencePlatform = Platform.OS === "ios" ? "ios" : "android";

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
    title: incoming.title ?? current.title,
  };
}

function docsFromPages(pages: WhiteboardPage[]) {
  return Object.fromEntries(pages.map((page) => [page.id, page.documentJson]));
}

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
  const pendingOpsRef = useRef<WhiteboardOps>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const adoptBoard = useCallback((row: Whiteboard, keepPageId?: string | null) => {
    setBoard(row);
    pagesDocRef.current = {
      ...pagesDocRef.current,
      ...docsFromPages(row.pages),
    };
    const nextPage =
      row.pages.find((page) => page.id === keepPageId) ??
      row.pages.find((page) => page.id === pageIdRef.current) ??
      row.pages[0] ??
      null;
    if (nextPage) {
      const doc = pagesDocRef.current[nextPage.id] ?? nextPage.documentJson;
      pagesDocRef.current[nextPage.id] = doc;
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
    const currentPageId = pageIdRef.current;
    const ops = compactOps(pendingOpsRef.current);
    pendingOpsRef.current = {};
    if (!ops) return;
    setSaveState("saving");
    try {
      const updated = currentPageId
        ? await applyWhiteboardPageOpsApi(whiteboardId, currentPageId, ops)
        : await applyWhiteboardOpsApi(whiteboardId, ops);
      adoptBoard(updated, currentPageId);
      setSaveState("saved");
    } catch {
      pendingOpsRef.current = mergePending(ops, pendingOpsRef.current);
      setSaveState("error");
    }
  }, [adoptBoard, whiteboardId]);

  const queueOps = useCallback(
    (ops: WhiteboardOps) => {
      pendingOpsRef.current = mergePending(pendingOpsRef.current, ops);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void flushOps();
      }, 800);
    },
    [flushOps],
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
      }
      queueOps(ops);
    },
    [applyPageDoc, queueOps, refreshHistoryFlags],
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
    pendingOpsRef.current = {};
    pagesDocRef.current = {};
    void getWhiteboardApi(whiteboardId)
      .then((row) => {
        if (cancelled) return;
        adoptBoard(row);
        setLoading(false);
        refreshHistoryFlags();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load whiteboard");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adoptBoard, refreshHistoryFlags, whiteboardId]);

  useEffect(() => {
    if (!user?.id) return;
    const colorForUser = presenceColorForUser(user.id);
    const channel = supabase.channel(`whiteboard:${whiteboardId}`, {
      config: {
        presence: { key: presenceSessionKey(user.id, SELF_PLATFORM) },
        broadcast: { self: false },
      },
    });

    channel
      .on("broadcast", { event: "stroke:add" }, ({ payload }) => {
        const parsed = unwrapStroke(payload);
        if (!parsed) return;
        if (parsed.userId) markDrawing(parsed.userId, false, parsed.platform);
        const targetPageId = parsed.pageId ?? pageIdRef.current;
        setRemoteDrafts((current) => {
          const next = { ...current };
          delete next[parsed.stroke.id];
          return next;
        });
        if (targetPageId) applyPageDoc(targetPageId, { addedStrokes: [parsed.stroke] });
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
        const key = presenceSessionKey(cursor.userId, cursor.platform ?? "web");
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
        pagesDocRef.current[page.id] = page.documentJson ?? emptyWhiteboardDocument();
        setBoard((current) => {
          if (!current || current.pages.some((item) => item.id === page.id)) return current;
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
            setBoardDoc(pagesDocRef.current[pages[0].id] ?? pages[0].documentJson);
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
          userId: user.id,
          name: user.fullName,
          color: colorForUser,
          platform: SELF_PLATFORM,
        });
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [applyPageDoc, markDrawing, selfKey, user?.fullName, user?.id, whiteboardId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushOps();
    });
    return () => {
      sub.remove();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      void flushOps();
    };
  }, [flushOps]);

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
    queueOps(ops);
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
  }, [applyPageDoc, canDraw, queueOps, refreshHistoryFlags, sendBroadcast]);

  const redo = useCallback(() => {
    if (!canDraw) return;
    const entry = redoRef.current.pop();
    if (!entry) return;
    const ops = applyHistory(entry);
    applyPageDoc(pageIdRef.current ?? "", ops);
    undoRef.current.push(entry);
    refreshHistoryFlags();
    queueOps(ops);
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
  }, [applyPageDoc, canDraw, queueOps, refreshHistoryFlags, sendBroadcast]);

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
      undoRef.current = [];
      redoRef.current = [];
      refreshHistoryFlags();
      setRemoteDrafts({});
      setPageId(nextPageId);
      setBoardDoc(pagesDocRef.current[nextPageId] ?? emptyWhiteboardDocument());
    },
    [flushOps, refreshHistoryFlags],
  );

  const addPage = useCallback(async () => {
    if (!canDraw) return;
    await flushOps();
    const updated = await addWhiteboardPageApi(whiteboardId);
    const created = updated.pages.find(
      (page) => !board?.pages.some((item) => item.id === page.id),
    );
    adoptBoard(updated, created?.id ?? pageIdRef.current);
    if (created) sendBroadcast("page:add", created);
    undoRef.current = [];
    redoRef.current = [];
    refreshHistoryFlags();
  }, [adoptBoard, board?.pages, canDraw, flushOps, refreshHistoryFlags, sendBroadcast, whiteboardId]);

  const removePage = useCallback(
    async (targetPageId: string) => {
      if (!canManage) return;
      await flushOps();
      const updated = await deleteWhiteboardPageApi(whiteboardId, targetPageId);
      delete pagesDocRef.current[targetPageId];
      adoptBoard(updated);
      sendBroadcast("page:remove", { pageId: targetPageId });
      undoRef.current = [];
      redoRef.current = [];
      refreshHistoryFlags();
    },
    [adoptBoard, canManage, flushOps, refreshHistoryFlags, sendBroadcast, whiteboardId],
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
