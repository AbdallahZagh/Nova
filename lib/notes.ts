export const NOTE_COLORS = ["SLATE", "AMBER", "CORAL", "SAGE", "SKY", "VIOLET"] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type NoteProject = {
  id: string;
  name: string;
  status?: string;
};

export type Note = {
  id: string;
  title: string | null;
  body: string;
  checklist: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  floating: boolean;
  posX: number | null;
  posY: number | null;
  width: number | null;
  height: number | null;
  preview: string;
  projectId: string | null;
  project: NoteProject | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteWrite = {
  title?: string | null;
  body?: string;
  checklist?: ChecklistItem[];
  color?: NoteColor;
  pinned?: boolean;
  floating?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  projectId?: string | null;
};

/** What the note will look like once the server accepts the change. */
export function applyNoteWrite(note: Note, write: NoteWrite): Note {
  const next: Note = { ...note };
  if (write.title !== undefined) next.title = write.title;
  if (write.body !== undefined) next.body = write.body;
  if (write.checklist !== undefined) next.checklist = write.checklist;
  if (write.color !== undefined) next.color = write.color;
  if (write.pinned !== undefined) next.pinned = write.pinned;
  if (write.floating !== undefined) next.floating = write.floating;
  if (write.posX !== undefined) next.posX = write.posX;
  if (write.posY !== undefined) next.posY = write.posY;
  if (write.width !== undefined) next.width = write.width;
  if (write.height !== undefined) next.height = write.height;
  if (write.projectId !== undefined) {
    next.projectId = write.projectId;
    if (write.projectId === null) next.project = null;
  }
  return next;
}

/** Solid surfaces so a sticky stays readable on top of any page. */
export const NOTE_SURFACE: Record<NoteColor, string> = {
  SLATE: "border-white/10 bg-[#262120] light:border-black/10 light:bg-[#e6ddd0]",
  AMBER: "border-amber-500/30 bg-[#3a2c12] light:border-amber-600/30 light:bg-[#fdeeb8]",
  CORAL: "border-orange-500/30 bg-[#3b2316] light:border-orange-600/30 light:bg-[#fcd9c4]",
  SAGE: "border-emerald-500/30 bg-[#1f3226] light:border-emerald-600/30 light:bg-[#d3ecd9]",
  SKY: "border-sky-500/30 bg-[#1b2f3d] light:border-sky-600/30 light:bg-[#cfe8f6]",
  VIOLET: "border-violet-500/30 bg-[#2d2342] light:border-violet-600/30 light:bg-[#e2d8f7]",
};

export const NOTE_SWATCH: Record<NoteColor, string> = {
  SLATE: "bg-stone-400",
  AMBER: "bg-amber-400",
  CORAL: "bg-orange-400",
  SAGE: "bg-emerald-400",
  SKY: "bg-sky-400",
  VIOLET: "bg-violet-400",
};

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  SLATE: "Stone",
  AMBER: "Amber",
  CORAL: "Coral",
  SAGE: "Sage",
  SKY: "Sky",
  VIOLET: "Violet",
};

export function noteTitle(note: Pick<Note, "title" | "preview">) {
  return note.title?.trim() || note.preview || "Untitled note";
}

export function checklistProgress(items: ChecklistItem[]) {
  if (!items.length) return "";
  const done = items.filter((item) => item.done).length;
  return `${done}/${items.length}`;
}

export function newChecklistItem(): ChecklistItem {
  return { id: crypto.randomUUID(), text: "", done: false };
}

export function editedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function sortNotes(notes: Note[]) {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function upsertNote(notes: Note[], note: Note) {
  const exists = notes.some((item) => item.id === note.id);
  return sortNotes(
    exists ? notes.map((item) => (item.id === note.id ? note : item)) : [note, ...notes],
  );
}

/** What the API would reject: no title, no text and no checklist text. */
export function isBlankDraft(draft: {
  title?: string | null;
  body?: string;
  checklist?: ChecklistItem[];
}) {
  return (
    !(draft.title ?? "").trim() &&
    !(draft.body ?? "").trim() &&
    !(draft.checklist ?? []).some((item) => item.text.trim())
  );
}

export const NOTE_STICKY_WIDTH = 296;
