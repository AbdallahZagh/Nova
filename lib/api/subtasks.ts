import { apiFetch } from "@/lib/api/client";

export type ApiSubtask = {
  id: string;
  title?: string;
  label?: string;
  isCompleted?: boolean;
  done?: boolean;
  isDone?: boolean;
};

export type SubtaskItem = { id: string; label: string; done: boolean };

export function apiSubtaskToSubtask(api: ApiSubtask): SubtaskItem {
  return {
    id: api.id,
    label: api.label ?? api.title ?? "",
    done: Boolean(api.isCompleted ?? api.done ?? api.isDone),
  };
}

export async function createSubtaskApi(taskId: string, title: string) {
  const data = await apiFetch<ApiSubtask>("/api/subtasks", {
    method: "POST",
    body: JSON.stringify({ taskId, title: title.trim() }),
  });
  return apiSubtaskToSubtask(data);
}

export async function updateSubtaskApi(
  id: string,
  patch: { title?: string; isCompleted?: boolean },
) {
  const body: Record<string, string | boolean> = {};
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.isCompleted !== undefined) body.isCompleted = patch.isCompleted;

  const data = await apiFetch<ApiSubtask>(`/api/subtasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return apiSubtaskToSubtask(data);
}

export async function deleteSubtaskApi(id: string) {
  await apiFetch<void>(`/api/subtasks/${id}`, { method: "DELETE" });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedSubtaskId(id: string): boolean {
  return UUID_RE.test(id);
}
