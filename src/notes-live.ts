import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
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
    const channel = supabase
      .channel(`notes:${userId}`)
      .on("broadcast", { event: "note" }, ({ payload }) => {
        const message = payload as NotesChange | undefined;
        if (!message || (message.kind !== "saved" && message.kind !== "deleted")) return;
        for (const listener of listeners) listener(message);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
