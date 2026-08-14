"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fitBoard } from "@/lib/whiteboard/fit";
import { drawCursors, drawDocument } from "@/lib/whiteboard/render";
import type {
  Stroke,
  StrokeTool,
  WhiteboardDocument,
  WhiteboardPresence,
} from "@/lib/whiteboard/types";
import { newStrokeId } from "@/lib/whiteboard/types";

type ViewState = {
  panX: number;
  panY: number;
  zoomX: number;
  zoomY: number;
};

type WhiteboardCanvasProps = {
  document: WhiteboardDocument;
  remoteDrafts: Stroke[];
  presence: WhiteboardPresence[];
  tool: StrokeTool;
  color: string;
  width: number;
  paper: string;
  surround: string;
  dark: boolean;
  onStrokeComplete: (stroke: Stroke) => void;
  onDraftChange: (stroke: Stroke | null) => void;
  onCursorMove: (x?: number, y?: number) => void;
  onInteract?: () => void;
  readOnly?: boolean;
};

function screenToDoc(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: ViewState,
) {
  return {
    x: (clientX - rect.left - view.panX) / view.zoomX,
    y: (clientY - rect.top - view.panY) / view.zoomY,
  };
}

export function WhiteboardCanvas({
  document,
  remoteDrafts,
  presence,
  tool,
  color,
  width,
  paper,
  dark,
  onStrokeComplete,
  onDraftChange,
  onCursorMove,
  onInteract,
  readOnly = false,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, zoomX: 1, zoomY: 1 });
  const currentStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const cursorThrottleRef = useRef(0);
  const draftThrottleRef = useRef(0);
  const strokeStartRef = useRef(0);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const onDraftChangeRef = useRef(onDraftChange);
  const onCursorMoveRef = useRef(onCursorMove);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  onStrokeCompleteRef.current = onStrokeComplete;
  onDraftChangeRef.current = onDraftChange;
  onCursorMoveRef.current = onCursorMove;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, cssW, cssH);

    viewRef.current = fitBoard(
      cssW,
      cssH,
      document.canvas.width,
      document.canvas.height,
    );

    const { zoomX, zoomY, panX, panY } = viewRef.current;
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoomX, zoomY);
    drawDocument(ctx, document, {
      drafts: remoteDrafts,
      current: currentStrokeRef.current,
      paper,
      dark,
    });
    drawCursors(ctx, presence);
    ctx.restore();
  }, [dark, document, paper, presence, remoteDrafts]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onInteract?.();
    if (readOnly) return;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const point = screenToDoc(event.clientX, event.clientY, rect, viewRef.current);
    drawingRef.current = true;
    strokeStartRef.current = event.timeStamp;
    currentStrokeRef.current = {
      id: newStrokeId(),
      color,
      width,
      tool,
      points: [
        {
          x: point.x,
          y: point.y,
          t: 0,
          ...(event.pressure > 0 ? { pressure: event.pressure } : {}),
        },
      ],
    };
    onDraftChangeRef.current(currentStrokeRef.current);
    redraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const point = screenToDoc(event.clientX, event.clientY, rect, viewRef.current);
    const now = Date.now();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) {
      onCursorMoveRef.current();
    } else if (drawingRef.current && now - cursorThrottleRef.current > 80) {
      cursorThrottleRef.current = now;
      onCursorMoveRef.current(point.x, point.y);
    }

    if (!drawingRef.current || !currentStrokeRef.current) return;

    const current = currentStrokeRef.current;
    currentStrokeRef.current = {
      ...current,
      points: [
        ...current.points,
        {
          x: point.x,
          y: point.y,
          t: event.timeStamp - strokeStartRef.current,
          ...(event.pressure > 0 ? { pressure: event.pressure } : {}),
        },
      ],
    };
    if (now - draftThrottleRef.current > 80) {
      draftThrottleRef.current = now;
      onDraftChangeRef.current(currentStrokeRef.current);
    }
    redraw();
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    onDraftChangeRef.current(null);
    onCursorMoveRef.current();
    if (stroke && stroke.points.length > 0) {
      onStrokeCompleteRef.current(stroke);
    }
    redraw();
  };

  const eraser = tool === "eraser";
  const cursor = width * viewRef.current.zoomX;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-glass"
      style={{ backgroundColor: paper }}
    >
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${
          readOnly ? "cursor-default" : eraser ? "cursor-none" : "cursor-crosshair"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          setPointer(null);
          onCursorMoveRef.current();
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      {eraser && pointer ? (
        <div
          className="pointer-events-none absolute rounded-full border border-primary/70 bg-primary/10"
          style={{
            width: cursor,
            height: cursor,
            left: pointer.x - cursor / 2,
            top: pointer.y - cursor / 2,
          }}
        />
      ) : null}
    </div>
  );
}
