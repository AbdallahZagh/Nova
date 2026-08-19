import * as FileSystem from "expo-file-system/legacy";
import { create } from "zustand";
import { attachTaskBase, stripTaskBase } from "@/offline/conflicts";

export type OfflineMutation = {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  createdAt: number;
  attempts?: number;
};

type OfflineState = {
  online: boolean;
  queuedCount: number;
  setOnline: (online: boolean) => void;
  setQueuedCount: (count: number) => void;
};

export const useOfflineStore = create<OfflineState>((set) => ({
  online: true,
  queuedCount: 0,
  setOnline: (online) => set({ online }),
  setQueuedCount: (queuedCount) => set({ queuedCount }),
}));

function cacheFile() {
  return `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}nova-offline-cache.json`;
}

function queueFile() {
  return `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}nova-offline-queue.json`;
}

async function readFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

async function writeFile(path: string, value: unknown) {
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  } catch {
    // ignore disk failures
  }
}

function normalizePath(path: string) {
  const withoutHost = path.replace(/^https?:\/\/[^/]+/i, "");
  const trimmed = (withoutHost.split("?")[0] ?? withoutHost) || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function shouldBypassOffline(path: string, data?: unknown) {
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  const value = path.toLowerCase();
  return (
    value.includes("/auth") ||
    value.includes("/login") ||
    value.includes("/otp") ||
    value.includes("/forgot") ||
    value.includes("/reactivate") ||
    value.includes("/export") ||
    value.includes("/snapshots") ||
    value.includes("/device-tokens") ||
    value.includes("/health") ||
    /\/pages\/[^/]+\/ops$/.test(value) ||
    /\/whiteboards\/[^/]+\/ops$/.test(value)
  );
}

export function isNetworkFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: string;
    message?: string;
    response?: unknown;
  };
  if (value.response) return false;
  return (
    value.code === "ERR_NETWORK" ||
    value.code === "ECONNABORTED" ||
    value.message === "Network Error" ||
    /network|timeout|offline/i.test(value.message ?? "")
  );
}

function responseStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const status = (error as { response?: { status?: number } }).response?.status;
  return typeof status === "number" ? status : null;
}

export async function readCachedGet<T>(path: string): Promise<T | null> {
  const cache = await readFile<Record<string, T>>(cacheFile(), {});
  return cache[normalizePath(path)] ?? null;
}

export async function writeCachedGet(path: string, data: unknown) {
  const file = cacheFile();
  const cache = await readFile<Record<string, unknown>>(file, {});
  cache[normalizePath(path)] = data;
  await writeFile(file, cache);
}

async function readQueue() {
  return readFile<OfflineMutation[]>(queueFile(), []);
}

async function writeQueue(rows: OfflineMutation[]) {
  await writeFile(queueFile(), rows);
  useOfflineStore.getState().setQueuedCount(rows.length);
}

export async function enqueueMutation(input: {
  method: string;
  path: string;
  body?: unknown;
}) {
  const path = normalizePath(input.path);
  let body = input.body;
  if (input.method.toUpperCase() === "PATCH") {
    const parsed =
      body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const cached = await readCachedGet<Record<string, unknown>>(path);
    body = attachTaskBase(path, parsed, cached) ?? body;
  }
  const rows = await readQueue();
  const item: OfflineMutation = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: input.method.toUpperCase(),
    path,
    body,
    createdAt: Date.now(),
    attempts: 0,
  };
  await writeQueue([...rows, item]);
  return item;
}

function newId() {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function optimisticMutationResponse(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const parsed =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const now = new Date().toISOString();
  const normalized = normalizePath(path);

  if (method === "DELETE") return "";

  if (method === "POST" && normalized === "/api/tasks" && parsed) {
    const row = {
      id: newId(),
      title: parsed.title,
      description: parsed.description ?? "",
      status: parsed.status ?? "To Do",
      priority: parsed.priority ?? "Medium",
      projectId: parsed.projectId,
      dueDate: parsed.dueDate ?? null,
      subtasks: parsed.subtasks ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await writeCachedGet(`/api/tasks/${row.id}`, row);
    return row;
  }

  if (method === "PATCH" && normalized.startsWith("/api/tasks/") && parsed) {
    const cached =
      (await readCachedGet<Record<string, unknown>>(normalized)) ?? {};
    const fields = stripTaskBase(parsed) ?? parsed;
    const row = { ...cached, ...fields, updatedAt: now };
    await writeCachedGet(normalized, row);
    return row;
  }

  if (method === "POST" && normalized === "/api/projects" && parsed) {
    const row = {
      id: newId(),
      name: parsed.name,
      title: parsed.name,
      description: parsed.description ?? "",
      status: parsed.status ?? "Active",
      members: parsed.members ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await writeCachedGet(`/api/projects/${row.id}`, row);
    return row;
  }

  if (method === "PATCH" && normalized.startsWith("/api/projects/") && parsed) {
    const cached =
      (await readCachedGet<Record<string, unknown>>(normalized)) ?? {};
    const row = { ...cached, ...parsed, updatedAt: now };
    await writeCachedGet(normalized, row);
    return row;
  }

  if (parsed) {
    return { ...parsed, id: parsed.id ?? newId(), updatedAt: now };
  }
  return { ok: true, queued: true };
}

let flushing = false;

function shouldDropFailedItem(error: unknown, attempts: number) {
  if (isNetworkFailure(error)) return false;
  const status = responseStatus(error);
  if (status == null) return attempts >= 5;
  if (status === 408 || status === 429 || status >= 500) return attempts >= 5;
  if (status === 401) return attempts >= 2;
  return true;
}

export async function flushOfflineQueue(
  send: (item: OfflineMutation) => Promise<void>,
) {
  if (flushing) return;
  const rows = await readQueue();
  if (!rows.length) {
    useOfflineStore.getState().setQueuedCount(0);
    return;
  }
  flushing = true;
  try {
    const remaining: OfflineMutation[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const item = rows[index];
      try {
        await send(item);
      } catch (error) {
        const attempts = (item.attempts ?? 0) + 1;
        if (isNetworkFailure(error)) {
          remaining.push({ ...item, attempts }, ...rows.slice(index + 1));
          break;
        }
        if (!shouldDropFailedItem(error, attempts)) {
          remaining.push({ ...item, attempts }, ...rows.slice(index + 1));
          break;
        }
      }
    }
    await writeQueue(remaining);
    if (remaining.length === 0) {
      useOfflineStore.getState().setOnline(true);
    }
  } finally {
    flushing = false;
  }
}

void readQueue().then((rows) => {
  useOfflineStore.getState().setQueuedCount(rows.length);
});
