const TASK_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "completedAt",
  "assigneeId",
] as const;

export function taskFieldBase(cached: Record<string, unknown> | null | undefined) {
  if (!cached) return undefined;
  const base: Record<string, unknown> = {};
  for (const key of TASK_FIELDS) {
    if (cached[key] !== undefined) base[key] = cached[key];
  }
  return Object.keys(base).length ? base : undefined;
}

export function isTaskPatchPath(path: string) {
  return /\/api\/tasks\/[^/]+$/.test(path.split("?")[0] ?? path);
}

export function attachTaskBase(
  path: string,
  body: Record<string, unknown> | null,
  cached: Record<string, unknown> | null | undefined,
) {
  if (!body || !isTaskPatchPath(path) || body.base) return body;
  const base = taskFieldBase(cached);
  if (!base) return body;
  return { ...body, base };
}

export function stripTaskBase(body: Record<string, unknown> | null) {
  if (!body) return body;
  const { base: _base, ...rest } = body;
  return rest;
}

export function taskConflictMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const row = data as {
    conflicts?: unknown;
    conflictBy?: { fullName?: string; username?: string | null };
  };
  if (!Array.isArray(row.conflicts) || row.conflicts.length === 0) return null;
  const name = row.conflictBy?.username
    ? `@${row.conflictBy.username}`
    : row.conflictBy?.fullName
      ? `@${row.conflictBy.fullName}`
      : "a teammate";
  return `Task was updated by ${name} while you were offline.`;
}
