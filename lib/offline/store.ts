import {
  attachTaskBase,
  stripTaskBase,
} from "@/lib/offline/conflicts";

const CACHE_PREFIX = "nova.offline.cache:";
const QUEUE_KEY = "nova.offline.queue";
const STATUS_KEY = "nova.offline.status";

export type OfflineMutation = {
  id: string;
  method: string;
  path: string;
  body?: string;
  createdAt: number;
};

type OfflineSnapshot = {
  online: boolean;
  queuedCount: number;
};

type Listener = () => void;

let online = typeof navigator === "undefined" ? true : navigator.onLine;
let queuedCount = 0;
let snapshot: OfflineSnapshot = { online, queuedCount };
const SERVER_SNAPSHOT: OfflineSnapshot = { online: true, queuedCount: 0 };
const listeners = new Set<Listener>();

function emit() {
  snapshot = { online, queuedCount };
  for (const listener of listeners) listener();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode.
  }
}

function normalizePath(path: string) {
  const trimmed = path.split("?")[0] ?? path;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function cacheKey(method: string, path: string) {
  return `${CACHE_PREFIX}${method.toUpperCase()}:${normalizePath(path)}`;
}

export function subscribeOfflineStatus(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineSnapshot() {
  return snapshot;
}

export function getOfflineServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function setOfflineStatus(nextOnline: boolean) {
  if (online === nextOnline) return;
  online = nextOnline;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STATUS_KEY, nextOnline ? "online" : "offline");
    } catch {
      // ignore
    }
  }
  emit();
}

export function isLikelyOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return !online;
}

export function shouldBypassOffline(path: string, body?: BodyInit | null) {
  if (body instanceof FormData) return true;
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

export function isNetworkFailure(error: unknown, status?: number) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (status === 0) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string; response?: unknown };
  if (value.response) return false;
  return (
    value.code === "ERR_NETWORK" ||
    value.code === "ECONNABORTED" ||
    value.message === "Network Error" ||
    /network|timeout|offline/i.test(value.message ?? "")
  );
}

export function readCachedGet<T>(path: string): T | null {
  return readJson<T | null>(cacheKey("GET", path), null);
}

export function writeCachedGet(path: string, data: unknown) {
  writeJson(cacheKey("GET", path), data);
}

function readQueue(): OfflineMutation[] {
  const rows = readJson<OfflineMutation[]>(QUEUE_KEY, []);
  queuedCount = rows.length;
  return rows;
}

function writeQueue(rows: OfflineMutation[]) {
  writeJson(QUEUE_KEY, rows);
  if (queuedCount === rows.length) return;
  queuedCount = rows.length;
  emit();
}

export function enqueueMutation(input: {
  method: string;
  path: string;
  body?: string;
}): OfflineMutation {
  const path = normalizePath(input.path);
  let body = input.body;
  if (input.method.toUpperCase() === "PATCH") {
    const parsed = parseBody(body);
    const cached = readCachedGet<Record<string, unknown>>(path);
    const next = attachTaskBase(path, parsed, cached);
    if (next) body = JSON.stringify(next);
  }
  const rows = readQueue();
  const item: OfflineMutation = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `offline-${Date.now()}`,
    method: input.method.toUpperCase(),
    path,
    body,
    createdAt: Date.now(),
  };
  writeQueue([...rows, item]);
  setOfflineStatus(false);
  return item;
}

export function getQueuedCount() {
  return readQueue().length;
}

function parseBody(body?: string) {
  if (!body) return null;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `offline-${Date.now()}`;
}

function patchListCache(path: string, mutate: (rows: unknown[]) => unknown[]) {
  const cached = readCachedGet<unknown>(path);
  if (!cached) return;
  if (Array.isArray(cached)) {
    writeCachedGet(path, mutate(cached));
    return;
  }
  if (cached && typeof cached === "object") {
    const record = cached as Record<string, unknown>;
    for (const key of ["tasks", "projects", "data", "items"]) {
      if (Array.isArray(record[key])) {
        writeCachedGet(path, { ...record, [key]: mutate(record[key] as unknown[]) });
        return;
      }
    }
  }
}

export function optimisticMutationResponse(
  method: string,
  path: string,
  body?: string,
): unknown {
  const parsed = parseBody(body);
  const now = new Date().toISOString();
  const normalized = normalizePath(path);

  if (method === "DELETE") return undefined;

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
    writeCachedGet(`/api/tasks/${row.id}`, row);
    if (typeof parsed.projectId === "string") {
      patchListCache(`/api/tasks/project/${parsed.projectId}`, (rows) => [row, ...rows]);
    }
    return row;
  }

  if (method === "PATCH" && normalized.startsWith("/api/tasks/") && parsed) {
    const cached = readCachedGet<Record<string, unknown>>(normalized) ?? {};
    const fields = stripTaskBase(parsed) ?? parsed;
    const row: Record<string, unknown> = { ...cached, ...fields, updatedAt: now };
    writeCachedGet(normalized, row);
    if (typeof row.projectId === "string") {
      patchListCache(`/api/tasks/project/${row.projectId}`, (rows) =>
        rows.map((item) =>
          item && typeof item === "object" && (item as { id?: string }).id === row.id
            ? { ...(item as object), ...row }
            : item,
        ),
      );
    }
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
    writeCachedGet(`/api/projects/${row.id}`, row);
    patchListCache("/api/projects", (rows) => [row, ...rows]);
    return row;
  }

  if (method === "PATCH" && normalized.startsWith("/api/projects/") && parsed) {
    const cached = readCachedGet<Record<string, unknown>>(normalized) ?? {};
    const row: Record<string, unknown> = { ...cached, ...parsed, updatedAt: now };
    writeCachedGet(normalized, row);
    patchListCache("/api/projects", (rows) =>
      rows.map((item) =>
        item && typeof item === "object" && (item as { id?: string }).id === row.id
          ? { ...(item as object), ...row }
          : item,
      ),
    );
    return row;
  }

  if (parsed && typeof parsed === "object") {
    const id =
      typeof parsed.id === "string" ? parsed.id : newId();
    return { ...parsed, id, updatedAt: now };
  }
  return parsed ?? { ok: true, queued: true };
}

let flushing = false;

export async function flushOfflineQueue(
  send: (item: OfflineMutation) => Promise<void>,
) {
  if (flushing) return;
  const rows = readQueue();
  if (!rows.length) return;
  flushing = true;
  try {
    for (let index = 0; index < rows.length; index += 1) {
      try {
        await send(rows[index]);
      } catch {
        writeQueue(rows.slice(index));
        return;
      }
    }
    writeQueue([]);
    setOfflineStatus(typeof navigator === "undefined" ? true : navigator.onLine);
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  queuedCount = readQueue().length;
  snapshot = { online, queuedCount };
  window.addEventListener("online", () => setOfflineStatus(true));
  window.addEventListener("offline", () => setOfflineStatus(false));
}
