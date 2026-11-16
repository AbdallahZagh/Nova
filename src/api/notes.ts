import { apiClient } from "@/api/apiClient";
import type { ChecklistItem, Note, NoteWrite } from "@/notes";

export async function listNotesApi(query: {
  projectId?: string;
  scope?: string;
  floating?: boolean;
  pinned?: boolean;
  q?: string;
} = {}) {
  const { data } = await apiClient.get<{ items?: Note[] }>("/api/notes", { params: query });
  return data.items ?? [];
}

export async function getNoteApi(id: string) {
  const { data } = await apiClient.get<Note>(`/api/notes/${id}`);
  return data;
}

export async function createNoteApi(input: NoteWrite) {
  const { data } = await apiClient.post<Note>("/api/notes", input);
  return data;
}

export async function updateNoteApi(id: string, input: Partial<NoteWrite>) {
  const { data } = await apiClient.patch<Note>(`/api/notes/${id}`, input);
  return data;
}

export async function deleteNoteApi(id: string) {
  await apiClient.delete(`/api/notes/${id}`);
}

export type { ChecklistItem, Note, NoteWrite };
