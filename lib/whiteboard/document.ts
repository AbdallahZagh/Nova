import type { Stroke, WhiteboardDocument, WhiteboardOps } from "./types";
import { emptyWhiteboardDocument } from "./types";

export function normalizeDocument(raw: unknown): WhiteboardDocument {
  if (!raw || typeof raw !== "object") return emptyWhiteboardDocument();
  const doc = raw as Partial<WhiteboardDocument>;
  return {
    canvas: {
      width: doc.canvas?.width ?? 2000,
      height: doc.canvas?.height ?? 1500,
    },
    strokes: Array.isArray(doc.strokes) ? doc.strokes : [],
    regions: Array.isArray(doc.regions) ? doc.regions : [],
  };
}

export function applyOpsLocally(
  current: WhiteboardDocument,
  ops: WhiteboardOps,
): WhiteboardDocument {
  const removedStrokeIds = new Set(ops.removedStrokeIds ?? []);
  const strokeMap = new Map(
    current.strokes
      .filter((stroke) => !removedStrokeIds.has(stroke.id))
      .map((stroke) => [stroke.id, stroke]),
  );
  for (const stroke of ops.addedStrokes ?? []) {
    if (removedStrokeIds.has(stroke.id)) continue;
    strokeMap.set(stroke.id, stroke);
  }

  const removedRegionIds = new Set(ops.removedRegionIds ?? []);
  const regionMap = new Map(
    current.regions
      .filter((region) => !removedRegionIds.has(region.id))
      .map((region) => [region.id, region]),
  );
  for (const region of ops.addedRegions ?? []) {
    if (removedRegionIds.has(region.id)) continue;
    regionMap.set(region.id, region);
  }

  return {
    canvas: ops.canvas ?? current.canvas,
    strokes: [...strokeMap.values()],
    regions: [...regionMap.values()],
  };
}

export function mergeStroke(current: Stroke | null, point: Stroke["points"][number]): Stroke {
  if (!current) {
    throw new Error("Cannot merge into an empty stroke");
  }
  return { ...current, points: [...current.points, point] };
}

export type HistoryEntry =
  | { type: "add"; stroke: Stroke }
  | { type: "remove"; strokes: Stroke[] };

export function invertHistory(entry: HistoryEntry): WhiteboardOps {
  if (entry.type === "add") {
    return { removedStrokeIds: [entry.stroke.id] };
  }
  return { addedStrokes: entry.strokes };
}

export function applyHistory(entry: HistoryEntry): WhiteboardOps {
  if (entry.type === "add") {
    return { addedStrokes: [entry.stroke] };
  }
  return { removedStrokeIds: entry.strokes.map((stroke) => stroke.id) };
}
