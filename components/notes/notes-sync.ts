"use client";

import { useEffect, useRef } from "react";
import { getSupabaseRealtimeClient } from "@/lib/supabase/client";
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
    const channel = supabase
      .channel(`notes:${userId}`)
      .on("broadcast", { event: "note" }, ({ payload }) => {
        const message = payload as NotesChange | undefined;
        if (!message || (message.kind !== "saved" && message.kind !== "deleted")) return;
        emitNotesChange(message);
      })
      .subscribe();
    return () => {
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
