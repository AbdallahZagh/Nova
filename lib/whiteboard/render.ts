import type { Stroke, WhiteboardDocument, WhiteboardPresence } from "./types";

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  paper: string,
  dark: boolean,
) {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = paper;
    ctx.lineWidth = stroke.width;
  } else if (stroke.tool === "highlighter") {
    ctx.globalCompositeOperation = dark ? "screen" : "multiply";
    ctx.globalAlpha = dark ? 0.45 : 0.35;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
  }

  const points = stroke.points;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
  } else {
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  ctx.stroke();
  ctx.restore();
}

export function drawDocument(
  ctx: CanvasRenderingContext2D,
  document: WhiteboardDocument,
  extras?: {
    drafts?: Stroke[];
    current?: Stroke | null;
    paper?: string;
    dark?: boolean;
  },
) {
  const paper = extras?.paper ?? "#161312";
  const dark = extras?.dark ?? false;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, document.canvas.width, document.canvas.height);

  for (const stroke of document.strokes) drawStroke(ctx, stroke, paper, dark);
  for (const stroke of extras?.drafts ?? []) drawStroke(ctx, stroke, paper, dark);
  if (extras?.current) drawStroke(ctx, extras.current, paper, dark);
}

export function drawCursors(
  ctx: CanvasRenderingContext2D,
  presence: WhiteboardPresence[],
) {
  for (const peer of presence) {
    if (peer.isSelf || !peer.drawing || peer.x == null || peer.y == null) continue;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = peer.color;
    ctx.beginPath();
    ctx.arc(peer.x, peer.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
    ctx.restore();
  }
}

export function exportDocumentPng(
  document: WhiteboardDocument,
  options?: { paper?: string; dark?: boolean },
): Promise<Blob> {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = document.canvas.width;
  canvas.height = document.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not create snapshot canvas"));
  drawDocument(ctx, document, {
    paper: options?.paper,
    dark: options?.dark,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode snapshot"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
