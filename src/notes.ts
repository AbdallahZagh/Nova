export const NOTE_COLORS = ["SLATE", "AMBER", "CORAL", "SAGE", "SKY", "VIOLET"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Note = {
  id: string;
  title: string | null;
  body: string;
  checklist: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  floating: boolean;
  posX?: number | null;
  posY?: number | null;
  preview: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
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
  projectId?: string | null;
};

export type NoteScope = "all" | "personal" | "project" | "pinned";

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  SLATE: "Stone",
  AMBER: "Amber",
  CORAL: "Coral",
  SAGE: "Sage",
  SKY: "Sky",
  VIOLET: "Violet",
};

/** The dot shown in colour pickers. */
export const NOTE_DOT: Record<NoteColor, string> = {
  SLATE: "#a8a29e",
  AMBER: "#fbbf24",
  CORAL: "#fb923c",
  SAGE: "#34d399",
  SKY: "#38bdf8",
  VIOLET: "#a78bfa",
};

const SURFACE = {
  light: {
    SLATE: "#e6ddd0",
    AMBER: "#fdeeb8",
    CORAL: "#fcd9c4",
    SAGE: "#d3ecd9",
    SKY: "#cfe8f6",
    VIOLET: "#e2d8f7",
  },
  dark: {
    SLATE: "#262120",
    AMBER: "#3a2c12",
    CORAL: "#3b2316",
    SAGE: "#1f3226",
    SKY: "#1b2f3d",
    VIOLET: "#2d2342",
  },
} as const;

export function noteSurface(color: NoteColor, mode: "light" | "dark") {
  return SURFACE[mode][color];
}

export function noteTitle(note: Pick<Note, "title" | "preview">) {
  return note.title?.trim() || note.preview || "Untitled note";
}

export function checklistProgress(items: ChecklistItem[]) {
  if (!items.length) return "";
  const done = items.filter((item) => item.done).length;
  return `${done}/${items.length}`;
}

export function filterNotes(notes: Note[], scope: NoteScope) {
  if (scope === "personal") return notes.filter((note) => !note.projectId);
  if (scope === "project") return notes.filter((note) => Boolean(note.projectId));
  if (scope === "pinned") return notes.filter((note) => note.pinned);
  return notes;
}

export function searchNotes(notes: Note[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => {
    const haystack = [
      note.title ?? "",
      note.body,
      note.project?.name ?? "",
      ...note.checklist.map((item) => item.text),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
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

export function newChecklistItem(): ChecklistItem {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    text: "",
    done: false,
  };
}

export function editedLabel(value: string, now: Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
