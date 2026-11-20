"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { createNoteApi, deleteNoteApi, updateNoteApi } from "@/lib/api/notes";
import {
  applyNoteWrite,
  isBlankDraft,
  type ChecklistItem,
  type Note,
  type NoteColor,
  type NoteWrite,
} from "@/lib/notes";
import { useToast } from "@/components/ui/Toast";
import { emitNotesChange, isNewerNote, useNotesChanges } from "@/components/notes/notes-sync";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type NoteFields = {
  title: string;
  body: string;
  checklist: ChecklistItem[];
  color: NoteColor;
  projectId: string;
  pinned: boolean;
  floating: boolean;
};

export type NoteFieldsPatch = Partial<NoteFields> & {
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
};

type Options = {
  note: Note | null;
  defaults?: Partial<NoteWrite>;
  /** Called the moment a brand new note exists on the server. */
  onCreated?: (note: Note) => void;
};

const TEXT_DELAY = 700;
const QUICK_DELAY = 0;

function savedChecklist(items: ChecklistItem[]) {
  return items.filter((item) => item.text.trim());
}

function toWrite(patch: NoteFieldsPatch): NoteWrite {
  const write: NoteWrite = {};
  if (patch.title !== undefined) write.title = patch.title;
  if (patch.body !== undefined) write.body = patch.body;
  if (patch.checklist !== undefined) write.checklist = savedChecklist(patch.checklist);
  if (patch.color !== undefined) write.color = patch.color;
  if (patch.projectId !== undefined) write.projectId = patch.projectId || null;
  if (patch.pinned !== undefined) write.pinned = patch.pinned;
  if (patch.floating !== undefined) write.floating = patch.floating;
  if (patch.posX !== undefined) write.posX = patch.posX;
  if (patch.posY !== undefined) write.posY = patch.posY;
  if (patch.width !== undefined) write.width = patch.width;
  if (patch.height !== undefined) write.height = patch.height;
  return write;
}

/**
 * One note being written. Edits are saved on their own: a brand new note is only
 * created once it has content, and every later edit is a PATCH.
 */
export function useNoteDraft({ note, defaults, onCreated }: Options) {
  const { toast } = useToast();
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  });
  const [fields, setFields] = useState<NoteFields>(() => ({
    title: note?.title ?? "",
    body: note?.body ?? "",
    checklist: note?.checklist ?? [],
    color: note?.color ?? defaults?.color ?? "AMBER",
    projectId: note?.projectId ?? defaults?.projectId ?? "",
    pinned: note?.pinned ?? defaults?.pinned ?? false,
    floating: note?.floating ?? defaults?.floating ?? false,
  }));
  const [saved, setSaved] = useState<Note | null>(note);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const fieldsRef = useRef(fields);
  const savedRef = useRef<Note | null>(note);
  const positionRef = useRef<{ posX?: number; posY?: number; width?: number; height?: number }>({
    posX: note?.posX ?? defaults?.posX ?? undefined,
    posY: note?.posY ?? defaults?.posY ?? undefined,
    width: note?.width ?? defaults?.width ?? undefined,
    height: note?.height ?? defaults?.height ?? undefined,
  });
  const idRef = useRef<string | null>(note?.id ?? null);
  const pendingRef = useRef<NoteWrite>({});
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const deletedRef = useRef(false);
  const failedRef = useRef(false);

  const run = useCallback(async () => {
    if (deletedRef.current) return;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    savingRef.current = true;
    try {
      let result: Note;
      if (!idRef.current) {
        const current = fieldsRef.current;
        const full: NoteWrite = {
          ...toWrite(current),
          ...positionRef.current,
        };
        if (isBlankDraft(full)) return;
        setStatus("saving");
        result = await createNoteApi(full);
        idRef.current = result.id;
        onCreatedRef.current?.(result);
      } else {
        setStatus("saving");
        result = await updateNoteApi(idRef.current, patch);
      }
      failedRef.current = false;
      setSaved(result);
      setStatus("saved");
      setErrorMessage("");
      // Newer edits are already on screen; do not roll other views back to this older result.
      if (Object.keys(pendingRef.current).length === 0) {
        savedRef.current = result;
        emitNotesChange({ kind: "saved", note: result });
      } else {
        savedRef.current = applyNoteWrite(result, pendingRef.current);
      }
    } catch (error) {
      pendingRef.current = { ...patch, ...pendingRef.current };
      const message = error instanceof ApiError ? error.message : "Please try again.";
      setStatus("error");
      setErrorMessage(message);
      if (!failedRef.current) {
        failedRef.current = true;
        toast({ variant: "error", title: "Could not save note", message });
      }
    } finally {
      savingRef.current = false;
    }
  }, [toast]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
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

  useNotesChanges((change) => {
    if (deletedRef.current || change.kind !== "saved") return;
    if (change.note.id !== idRef.current) return;
    if (savingRef.current || Object.keys(pendingRef.current).length > 0) return;
    if (!isNewerNote(change.note.updatedAt, savedRef.current?.updatedAt)) return;
    const remote = change.note;
    savedRef.current = remote;
    fieldsRef.current = {
      title: remote.title ?? "",
      body: remote.body,
      checklist: remote.checklist,
      color: remote.color,
      projectId: remote.projectId ?? "",
      pinned: remote.pinned,
      floating: remote.floating,
    };
    positionRef.current = {
      posX: remote.posX ?? undefined,
      posY: remote.posY ?? undefined,
      width: remote.width ?? undefined,
      height: remote.height ?? undefined,
    };
    setFields(fieldsRef.current);
    setSaved(remote);
    setStatus("saved");
  });

  const set = useCallback(
    (patch: NoteFieldsPatch) => {
      const { posX, posY, width, height, ...rest } = patch;
      if (Object.keys(rest).length > 0) {
        fieldsRef.current = { ...fieldsRef.current, ...rest };
        setFields(fieldsRef.current);
      }
      if (posX !== undefined) positionRef.current.posX = posX;
      if (posY !== undefined) positionRef.current.posY = posY;
      if (width !== undefined) positionRef.current.width = width;
      if (height !== undefined) positionRef.current.height = height;
      const write = toWrite(patch);
      pendingRef.current = { ...pendingRef.current, ...write };
      // Show the change everywhere right away; the save catches up in the background.
      if (savedRef.current) {
        savedRef.current = applyNoteWrite(savedRef.current, write);
        emitNotesChange({ kind: "saved", note: savedRef.current });
      }
      const typing = patch.title !== undefined || patch.body !== undefined || patch.checklist !== undefined;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), typing ? TEXT_DELAY : QUICK_DELAY);
    },
    [flush],
  );

  const remove = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await queueRef.current;
    deletedRef.current = true;
    pendingRef.current = {};
    const id = idRef.current;
    if (!id) return true;
    try {
      await deleteNoteApi(id);
      emitNotesChange({ kind: "deleted", id });
      return true;
    } catch (error) {
      deletedRef.current = false;
      toast({
        variant: "error",
        title: "Could not delete note",
        message: error instanceof ApiError ? error.message : "Please try again.",
      });
      return false;
    }
  }, [toast]);

  return {
    fields,
    noteId: saved?.id ?? null,
    saved,
    status,
    errorMessage,
    set,
    flush,
    remove,
  };
}
