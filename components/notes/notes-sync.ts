"use client";

import { useEffect, useRef } from "react";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";
import { getNoteApi } from "@/lib/api/notes";
import type { Note } from "@/lib/notes";

export const NOTES_CHANGED_EVENT = "nova:notes-changed";
export const NEW_STICKY_EVENT = "nova:new-sticky";

export type NotesChange = { kind: "saved"; note: Note } | { kind: "deleted"; id: string };

/** Tell every open notes view (board, project drawer, stickies) about a change. */
export function emitNotesChange(change: NotesChange) {
  window.dispatchEvent(new CustomEvent<NotesChange>(NOTES_CHANGED_EVENT, { detail: change }));
}

export function requestNewSticky() {
  window.dispatchEvent(new Event(NEW_STICKY_EVENT));
}

export function isNewerNote(incoming: string, current?: string | null) {
  const next = new Date(incoming).getTime();
  const previous = current ? new Date(current).getTime() : 0;
  return Number.isFinite(next) && next > previous;
}

/** Live notes for this account, from every other signed-in device. */
export function useNotesRealtime(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseRealtimeClient();
    if (!supabase) return;
    const refreshing = new Map<string, symbol>();
    const channel = supabase
      .channel(`notes:${userId}`)
      .on("broadcast", { event: "note" }, ({ payload }) => {
        const message = payload as NotesChange | { kind: "refresh"; id: string } | undefined;
        if (message?.kind === "refresh" && typeof message.id === "string") {
          const id = message.id;
          const request = Symbol();
          refreshing.set(id, request);
          void getNoteApi(encodeURIComponent(id)).then((note) => {
            if (refreshing.get(id) === request) emitNotesChange({ kind: "saved", note });
          }).catch(() => {}).finally(() => {
            if (refreshing.get(id) === request) refreshing.delete(id);
          });
          return;
        }
        if (!message || (message.kind !== "saved" && message.kind !== "deleted")) return;
        const id = message.kind === "deleted" ? message.id : message.note?.id;
        if (typeof id !== "string") return;
        refreshing.delete(id);
        emitNotesChange(message);
      })
      .subscribe();
    return () => {
      refreshing.clear();
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}

export function useNotesChanges(handler: (change: NotesChange) => void) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event: Event) => {
      handlerRef.current((event as CustomEvent<NotesChange>).detail);
    };
    window.addEventListener(NOTES_CHANGED_EVENT, listener);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, listener);
  }, []);
}
