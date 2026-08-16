import type { Stroke } from "@/api/whiteboards";

const pathCache = new Map<string, { token: string; d: string }>();

function strokeToken(stroke: Stroke) {
  const last = stroke.points[stroke.points.length - 1];
  return `${stroke.points.length}:${stroke.color}:${stroke.width}:${stroke.tool}:${last?.x ?? 0}:${last?.y ?? 0}`;
}

export function cachedStrokeToPath(stroke: Stroke) {
  const token = strokeToken(stroke);
  const hit = pathCache.get(stroke.id);
  if (hit && hit.token === token) return hit.d;
  const d = strokeToPath(stroke);
  pathCache.set(stroke.id, { token, d });
  return d;
}

export function pruneStrokePathCache(ids: Iterable<string>) {
  const keep = new Set(ids);
  for (const id of pathCache.keys()) {
    if (!keep.has(id)) pathCache.delete(id);
  }
}

export function strokeToPath(stroke: Stroke) {
  const points = stroke.points;
  if (!points.length) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function strokeOpacity(stroke: Stroke, dark: boolean) {
  if (stroke.tool !== "highlighter") return 1;
  return dark ? 0.45 : 0.35;
}

export function strokeColor(stroke: Stroke, paper: string) {
  return stroke.tool === "eraser" ? paper : stroke.color;
}
