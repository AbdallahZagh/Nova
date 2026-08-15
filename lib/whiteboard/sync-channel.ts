import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { HistoryEntry } from "./document";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";
import {
  emptyWhiteboardDocument,
  presenceColorForUser,
  presenceSessionKey,
  type PresencePlatform,
  type Stroke,
  type Whiteboard,
  type WhiteboardDocument,
  type WhiteboardOps,
  type WhiteboardPage,
  type WhiteboardPresence,
} from "./types";
import type { HistoryByPage } from "./pendingStore";
import { SELF_PLATFORM, unwrapStroke } from "./sync-ops";

type Channel = NonNullable<
  ReturnType<NonNullable<ReturnType<typeof getSupabaseRealtimeClient>>["channel"]>
>;

export type WhiteboardChannel = Channel;

export type WhiteboardRealtimeContext = {
  whiteboardId: string;
  selfKey: string | null;
  profile: { id: string; name: string };
  pageIdRef: MutableRefObject<string | null>;
  pagesDocRef: MutableRefObject<Record<string, WhiteboardDocument>>;
  undoRef: MutableRefObject<HistoryEntry[]>;
  redoRef: MutableRefObject<HistoryEntry[]>;
  undoByPageRef: MutableRefObject<HistoryByPage>;
  redoByPageRef: MutableRefObject<HistoryByPage>;
  channelRef: MutableRefObject<Channel | null>;
  markDrawing: (
    userId: string,
    drawing: boolean,
    platform?: PresencePlatform,
  ) => void;
  applyPageDoc: (targetPageId: string, ops: WhiteboardOps) => void;
  persistPending: () => void;
  refreshHistoryFlags: () => void;
  setRemoteDrafts: Dispatch<SetStateAction<Record<string, Stroke>>>;
  setPresence: Dispatch<SetStateAction<WhiteboardPresence[]>>;
  setBoard: Dispatch<SetStateAction<Whiteboard | null>>;
  setPageId: Dispatch<SetStateAction<string | null>>;
  setBoardDoc: Dispatch<SetStateAction<WhiteboardDocument>>;
};

export function subscribeWhiteboardRealtime(ctx: WhiteboardRealtimeContext) {
  const supabase = getSupabaseRealtimeClient();
  if (!supabase) return () => undefined;

  const color = presenceColorForUser(ctx.profile.id);
  const channel = supabase.channel(`whiteboard:${ctx.whiteboardId}`, {
    config: {
      presence: { key: presenceSessionKey(ctx.profile.id, SELF_PLATFORM) },
      broadcast: { self: false },
    },
  });

  channel
    .on("broadcast", { event: "stroke:add" }, ({ payload }) => {
      const parsed = unwrapStroke(payload);
      if (!parsed) return;
      const { stroke, userId, platform } = parsed;
      if (userId) ctx.markDrawing(userId, false, platform);
      const targetPageId = parsed.pageId ?? ctx.pageIdRef.current;
      ctx.setRemoteDrafts((current) => {
        const next = { ...current };
        delete next[stroke.id];
        return next;
      });
      if (targetPageId) ctx.applyPageDoc(targetPageId, { addedStrokes: [stroke] });
    })
    .on("broadcast", { event: "history:push" }, ({ payload }) => {
      const body = payload as { pageId?: string; entry?: HistoryEntry };
      if (!body.entry || !body.pageId) return;
      if (body.pageId === ctx.pageIdRef.current) {
        ctx.undoRef.current = [...ctx.undoRef.current, body.entry];
        ctx.redoRef.current = [];
        ctx.refreshHistoryFlags();
      } else {
        ctx.undoByPageRef.current[body.pageId] = [
          ...(ctx.undoByPageRef.current[body.pageId] ?? []),
          body.entry,
        ];
        ctx.redoByPageRef.current[body.pageId] = [];
      }
      ctx.persistPending();
    })
    .on("broadcast", { event: "history:undo" }, ({ payload }) => {
      const pageId =
        (payload as { pageId?: string }).pageId ?? ctx.pageIdRef.current;
      if (!pageId) return;
      if (pageId === ctx.pageIdRef.current) {
        const entry = ctx.undoRef.current.pop();
        if (entry) ctx.redoRef.current.push(entry);
        ctx.refreshHistoryFlags();
      } else {
        const stack = [...(ctx.undoByPageRef.current[pageId] ?? [])];
        const entry = stack.pop();
        if (entry) {
          ctx.undoByPageRef.current[pageId] = stack;
          ctx.redoByPageRef.current[pageId] = [
            ...(ctx.redoByPageRef.current[pageId] ?? []),
            entry,
          ];
        }
      }
      ctx.persistPending();
    })
    .on("broadcast", { event: "history:redo" }, ({ payload }) => {
      const pageId =
        (payload as { pageId?: string }).pageId ?? ctx.pageIdRef.current;
      if (!pageId) return;
      if (pageId === ctx.pageIdRef.current) {
        const entry = ctx.redoRef.current.pop();
        if (entry) ctx.undoRef.current.push(entry);
        ctx.refreshHistoryFlags();
      } else {
        const stack = [...(ctx.redoByPageRef.current[pageId] ?? [])];
        const entry = stack.pop();
        if (entry) {
          ctx.redoByPageRef.current[pageId] = stack;
          ctx.undoByPageRef.current[pageId] = [
            ...(ctx.undoByPageRef.current[pageId] ?? []),
            entry,
          ];
        }
      }
      ctx.persistPending();
    })
    .on("broadcast", { event: "stroke:remove" }, ({ payload }) => {
      const body = payload as { ids?: string[]; pageId?: string };
      const ids = body.ids ?? [];
      if (!ids.length) return;
      ctx.applyPageDoc(body.pageId ?? ctx.pageIdRef.current ?? "", {
        removedStrokeIds: ids,
      });
    })
    .on("broadcast", { event: "stroke:draft" }, ({ payload }) => {
      const parsed = unwrapStroke(payload);
      if (!parsed) return;
      if (parsed.userId) ctx.markDrawing(parsed.userId, true, parsed.platform);
      if (parsed.pageId && parsed.pageId !== ctx.pageIdRef.current) return;
      ctx.setRemoteDrafts((current) => ({
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
      if (key === ctx.selfKey) return;
      ctx.setPresence((current) =>
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
      ctx.pagesDocRef.current[page.id] =
        page.documentJson ?? emptyWhiteboardDocument();
      ctx.setBoard((current) => {
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
      delete ctx.pagesDocRef.current[removedId];
      ctx.setBoard((current) => {
        if (!current) return current;
        const pages = current.pages.filter((page) => page.id !== removedId);
        if (ctx.pageIdRef.current === removedId && pages[0]) {
          ctx.setPageId(pages[0].id);
          ctx.setBoardDoc(
            ctx.pagesDocRef.current[pages[0].id] ?? pages[0].documentJson,
          );
        }
        return { ...current, pages };
      });
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<WhiteboardPresence>();
      ctx.setPresence((current) => {
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
          if (session === ctx.selfKey) continue;
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
        userId: ctx.profile.id,
        name: ctx.profile.name,
        color,
        platform: SELF_PLATFORM,
      });
    });

  ctx.channelRef.current = channel;

  return () => {
    ctx.channelRef.current = null;
    void supabase.removeChannel(channel);
  };
}
