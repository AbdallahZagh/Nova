import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/api/apiClient";
import { createNoteApi, deleteNoteApi, updateNoteApi } from "@/api/notes";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { isNewerNote, subscribeNoteChanges } from "@/notes-live";
import {
  isBlankDraft,
  type ChecklistItem,
  type Note,
  type NoteColor,
  type NoteWrite,
} from "@/notes";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type NoteFields = {
  title: string;
  body: string;
  checklist: ChecklistItem[];
  color: NoteColor;
  projectId: string;
  pinned: boolean;
};

const TEXT_DELAY = 700;
const QUICK_DELAY = 120;

function toWrite(patch: Partial<NoteFields>): NoteWrite {
  const write: NoteWrite = {};
  if (patch.title !== undefined) write.title = patch.title;
  if (patch.body !== undefined) write.body = patch.body;
  if (patch.checklist !== undefined) {
    write.checklist = patch.checklist.filter((item) => item.text.trim());
  }
  if (patch.color !== undefined) write.color = patch.color;
  if (patch.projectId !== undefined) write.projectId = patch.projectId || null;
  if (patch.pinned !== undefined) write.pinned = patch.pinned;
  return write;
}

/**
 * One note being written. A new note is only created once it has content;
 * every later edit is a PATCH, and the latest edits are sent when you leave.
 */
export function useNoteDraft({
  note,
  defaults,
}: {
  note: Note | null;
  defaults?: { projectId?: string };
}) {
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [fields, setFields] = useState<NoteFields>(() => ({
    title: note?.title ?? "",
    body: note?.body ?? "",
    checklist: note?.checklist ?? [],
    color: note?.color ?? "AMBER",
    projectId: note?.projectId ?? defaults?.projectId ?? "",
    pinned: note?.pinned ?? false,
  }));
  const [saved, setSaved] = useState<Note | null>(note);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const fieldsRef = useRef(fields);
  const savedRef = useRef<Note | null>(note);
  const idRef = useRef<string | null>(note?.id ?? null);
  const pendingRef = useRef<NoteWrite>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const deletedRef = useRef(false);
  const failedRef = useRef(false);

  const run = useCallback(async () => {
    if (deletedRef.current) return;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    try {
      let result: Note;
      if (!idRef.current) {
        const full = toWrite(fieldsRef.current);
        if (isBlankDraft(full)) return;
        setStatus("saving");
        result = await createNoteApi(full);
        idRef.current = result.id;
      } else {
        setStatus("saving");
        result = await updateNoteApi(idRef.current, patch);
      }
      failedRef.current = false;
      savedRef.current = result;
      setSaved(result);
      setStatus("saved");
      setErrorMessage("");
    } catch (error) {
      pendingRef.current = { ...patch, ...pendingRef.current };
      const message = getApiErrorMessage(error, "Please try again.");
      setStatus("error");
      setErrorMessage(message);
      if (!failedRef.current) {
        failedRef.current = true;
        showSnackbar({ variant: "error", title: "Could not save note", message });
      }
    }
  }, [showSnackbar]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    queueRef.current = queueRef.current.then(run);
    return queueRef.current;
  }, [run]);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);

  useEffect(() => {
    return subscribeNoteChanges((change) => {
      if (deletedRef.current || change.kind !== "saved") return;
      if (change.note.id !== idRef.current) return;
      if (Object.keys(pendingRef.current).length > 0) return;
      if (!isNewerNote(change.note.updatedAt, savedRef.current?.updatedAt)) return;
      const remote = change.note;
      savedRef.current = remote;
      fieldsRef.current = {
        title: remote.title ?? "",
        body: remote.body,
        checklist: remote.checklist ?? [],
        color: remote.color,
        projectId: remote.projectId ?? "",
        pinned: remote.pinned,
      };
      setFields(fieldsRef.current);
      setSaved(remote);
      setStatus("saved");
    });
  }, []);

  const set = useCallback(
    (patch: Partial<NoteFields>) => {
      fieldsRef.current = { ...fieldsRef.current, ...patch };
      setFields(fieldsRef.current);
      pendingRef.current = { ...pendingRef.current, ...toWrite(patch) };
      const typing =
        patch.title !== undefined || patch.body !== undefined || patch.checklist !== undefined;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), typing ? TEXT_DELAY : QUICK_DELAY);
    },
    [flush],
  );

  const remove = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await queueRef.current;
    deletedRef.current = true;
    pendingRef.current = {};
    const id = idRef.current;
    if (!id) return true;
    try {
      await deleteNoteApi(id);
      return true;
    } catch (error) {
      deletedRef.current = false;
      showSnackbar({
        variant: "error",
        title: "Could not delete note",
        message: getApiErrorMessage(error, "Please try again."),
      });
      return false;
    }
  }, [showSnackbar]);

  return {
    fields,
    saved,
    noteId: saved?.id ?? null,
    status,
    errorMessage,
    set,
    flush,
    remove,
  };
}
