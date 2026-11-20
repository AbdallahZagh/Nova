"use client";

import { useCallback } from "react";
import { ApiError } from "@/lib/api/client";
import { createNoteApi, deleteNoteApi, updateNoteApi } from "@/lib/api/notes";
import { applyNoteWrite, type Note, type NoteWrite } from "@/lib/notes";
import { useToast } from "@/components/ui/Toast";
import { emitNotesChange } from "@/components/notes/notes-sync";

/**
 * One-shot note actions (pin, recolour, duplicate, delete). The screen changes the
 * moment you click; the save follows, and the change is undone if the save fails.
 */
export function useNoteActions() {
  const { toast } = useToast();

  const fail = useCallback(
    (title: string, error: unknown) => {
      toast({
        variant: "error",
        title,
        message: error instanceof ApiError ? error.message : "Please try again.",
      });
    },
    [toast],
  );

  const patch = useCallback(
    async (note: Note, input: NoteWrite) => {
      emitNotesChange({ kind: "saved", note: applyNoteWrite(note, input) });
      try {
        const saved = await updateNoteApi(note.id, input);
        emitNotesChange({ kind: "saved", note: saved });
        return saved;
      } catch (error) {
        emitNotesChange({ kind: "saved", note });
        fail("Could not update note", error);
        return null;
      }
    },
    [fail],
  );

  const duplicate = useCallback(
    async (note: Note) => {
      try {
        const copy = await createNoteApi({
          title: note.title ? `${note.title} (copy)` : null,
          body: note.body,
          checklist: note.checklist.map((item) => ({ ...item, id: crypto.randomUUID() })),
          color: note.color,
          projectId: note.projectId,
        });
        emitNotesChange({ kind: "saved", note: copy });
        toast({ variant: "success", title: "Note duplicated" });
        return copy;
      } catch (error) {
        fail("Could not duplicate note", error);
        return null;
      }
    },
    [fail, toast],
  );

  const remove = useCallback(
    async (note: Note) => {
      emitNotesChange({ kind: "deleted", id: note.id });
      try {
        await deleteNoteApi(note.id);
        toast({ variant: "success", title: "Note deleted" });
        return true;
      } catch (error) {
        emitNotesChange({ kind: "saved", note });
        fail("Could not delete note", error);
        return false;
      }
    },
    [fail, toast],
  );

  return { patch, duplicate, remove };
}
