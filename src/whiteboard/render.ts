import type { Stroke } from "@/api/whiteboards";

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
