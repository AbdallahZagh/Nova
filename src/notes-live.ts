import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { getNoteApi } from "@/api/notes";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/notifications";
import type { Note } from "@/notes";

export type NotesChange = { kind: "saved"; note: Note } | { kind: "deleted"; id: string };

const listeners = new Set<(change: NotesChange) => void>();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export function subscribeNoteChanges(handler: (change: NotesChange) => void) {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export function isNewerNote(incoming: string, current?: string | null) {
  const next = new Date(incoming).getTime();
  const previous = current ? new Date(current).getTime() : 0;
  return Number.isFinite(next) && next > previous;
}

export function useNotesRealtime(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
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
            if (refreshing.get(id) === request) {
              for (const listener of listeners) listener({ kind: "saved", note });
            }
          }).catch(() => {}).finally(() => {
            if (refreshing.get(id) === request) refreshing.delete(id);
          });
          return;
        }
        if (!message || (message.kind !== "saved" && message.kind !== "deleted")) return;
        const id = message.kind === "deleted" ? message.id : message.note?.id;
        if (typeof id !== "string") return;
        refreshing.delete(id);
        for (const listener of listeners) listener(message);
      })
      .subscribe();
    return () => {
      refreshing.clear();
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
