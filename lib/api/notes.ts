import { apiFetch } from "@/lib/api/client";
import type { ChecklistItem, Note, NoteColor, NoteWrite } from "@/lib/notes";

export type NoteQuery = {
  projectId?: string;
  scope?: "all" | "personal" | "project";
  pinned?: boolean;
  floating?: boolean;
  color?: NoteColor;
  q?: string;
};

function queryString(query: NoteQuery = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.scope && query.scope !== "all") params.set("scope", query.scope);
  if (query.pinned) params.set("pinned", "true");
  if (query.floating) params.set("floating", "true");
  if (query.color) params.set("color", query.color);
  if (query.q?.trim()) params.set("q", query.q.trim());
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function listNotesApi(query: NoteQuery = {}) {
  const data = await apiFetch<{ items?: Note[] }>(`/api/notes${queryString(query)}`);
  return data.items ?? [];
}

export async function getNoteApi(id: string) {
  return apiFetch<Note>(`/api/notes/${id}`);
}

export async function createNoteApi(input: NoteWrite) {
  return apiFetch<Note>("/api/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateNoteApi(id: string, input: Partial<NoteWrite>) {
  return apiFetch<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteNoteApi(id: string) {
  return apiFetch<{ message: string }>(`/api/notes/${id}`, { method: "DELETE" });
}
