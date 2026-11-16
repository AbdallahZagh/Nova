"use client";

import { useEffect, useRef } from "react";
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
