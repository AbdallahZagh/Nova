import { create } from "zustand";

export type OfflineMutation = {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  createdAt: number;
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

function cacheFile(FileSystem: typeof import("expo-file-system/legacy")) {
  return `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}nova-offline-cache.json`;
}

function queueFile(FileSystem: typeof import("expo-file-system/legacy")) {
  return `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}nova-offline-queue.json`;
}

async function readFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

async function writeFile(path: string, value: unknown) {
  try {
    const FileSystem = await import("expo-file-system/legacy");
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

export async function readCachedGet<T>(path: string): Promise<T | null> {
  const FileSystem = await import("expo-file-system/legacy");
  const cache = await readFile<Record<string, T>>(cacheFile(FileSystem), {});
  return cache[normalizePath(path)] ?? null;
}

export async function writeCachedGet(path: string, data: unknown) {
  const FileSystem = await import("expo-file-system/legacy");
  const file = cacheFile(FileSystem);
  const cache = await readFile<Record<string, unknown>>(file, {});
  cache[normalizePath(path)] = data;
  await writeFile(file, cache);
}

async function readQueue() {
  const FileSystem = await import("expo-file-system/legacy");
  return readFile<OfflineMutation[]>(queueFile(FileSystem), []);
}

async function writeQueue(rows: OfflineMutation[]) {
  const FileSystem = await import("expo-file-system/legacy");
  await writeFile(queueFile(FileSystem), rows);
  useOfflineStore.getState().setQueuedCount(rows.length);
}

export async function enqueueMutation(input: {
  method: string;
  path: string;
  body?: unknown;
}) {
  const rows = await readQueue();
  const item: OfflineMutation = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method: input.method.toUpperCase(),
    path: normalizePath(input.path),
    body: input.body,
    createdAt: Date.now(),
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
    const row = { ...cached, ...parsed, updatedAt: now };
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

export async function flushOfflineQueue(
  send: (item: OfflineMutation) => Promise<void>,
) {
  if (flushing) return;
  const rows = await readQueue();
  if (!rows.length) return;
  flushing = true;
  try {
    for (let index = 0; index < rows.length; index += 1) {
      try {
        await send(rows[index]);
      } catch {
        await writeQueue(rows.slice(index));
        return;
      }
    }
    await writeQueue([]);
    useOfflineStore.getState().setOnline(true);
  } finally {
    flushing = false;
  }
}

void readQueue().then((rows) => {
  useOfflineStore.getState().setQueuedCount(rows.length);
});
