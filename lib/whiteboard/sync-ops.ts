import type { Stroke, WhiteboardOps, PresencePlatform } from "./types";

export const SELF_PLATFORM: PresencePlatform = "web";

export function unwrapStroke(payload: unknown): {
  userId?: string;
  platform?: PresencePlatform;
  pageId?: string;
  stroke: Stroke;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as {
    userId?: string;
    platform?: PresencePlatform;
    pageId?: string;
    stroke?: Stroke;
    id?: string;
    points?: unknown;
  };
  if (value.stroke?.id && Array.isArray(value.stroke.points)) {
    return {
      userId: value.userId,
      platform: value.platform,
      pageId: value.pageId,
      stroke: value.stroke,
    };
  }
  if (value.id && Array.isArray(value.points)) {
    return { userId: value.userId, stroke: value as Stroke };
  }
  return null;
}

export function compactOps(ops: WhiteboardOps): WhiteboardOps | null {
  const removed = new Set(ops.removedStrokeIds ?? []);
  const added = (ops.addedStrokes ?? []).filter((stroke) => {
    if (!removed.has(stroke.id)) return true;
    removed.delete(stroke.id);
    return false;
  });
  const next: WhiteboardOps = {};
  if (added.length) next.addedStrokes = added;
  if (removed.size) next.removedStrokeIds = [...removed];
  if (ops.addedRegions?.length) next.addedRegions = ops.addedRegions;
  if (ops.removedRegionIds?.length) next.removedRegionIds = ops.removedRegionIds;
  if (ops.canvas) next.canvas = ops.canvas;
  if (ops.title !== undefined) next.title = ops.title;
  return Object.keys(next).length ? next : null;
}

export function mergePending(
  current: WhiteboardOps,
  incoming: WhiteboardOps,
): WhiteboardOps {
  return {
    addedStrokes: [...(current.addedStrokes ?? []), ...(incoming.addedStrokes ?? [])],
    removedStrokeIds: [
      ...(current.removedStrokeIds ?? []),
      ...(incoming.removedStrokeIds ?? []),
    ],
    addedRegions: [...(current.addedRegions ?? []), ...(incoming.addedRegions ?? [])],
    removedRegionIds: [
      ...(current.removedRegionIds ?? []),
      ...(incoming.removedRegionIds ?? []),
    ],
    canvas: incoming.canvas ?? current.canvas,
    title: incoming.title ?? current.title,
  };
}
