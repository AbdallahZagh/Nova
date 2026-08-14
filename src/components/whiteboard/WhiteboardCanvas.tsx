import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanResponder, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  fitBoard,
  newStrokeId,
  type Stroke,
  type StrokeTool,
  type WhiteboardDocument,
} from "@/api/whiteboards";
import type { WhiteboardPresence } from "@/hooks/useWhiteboardSync";

function strokeToPath(stroke: Stroke) {
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

function strokeOpacity(stroke: Stroke, dark: boolean) {
  if (stroke.tool !== "highlighter") return 1;
  return dark ? 0.45 : 0.35;
}

function strokeColor(stroke: Stroke, paper: string) {
  return stroke.tool === "eraser" ? paper : stroke.color;
}

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
  onStrokeMove: (stroke: Stroke | null) => void;
  onStrokeComplete: (stroke: Stroke) => void;
  onCursorMove: (x?: number, y?: number) => void;
  onInteract?: () => void;
  readOnly?: boolean;
};

export type WhiteboardCanvasHandle = {
  capturePng: () => Promise<string>;
};

type SvgCapture = {
  toDataURL?: (
    callback: (data: string) => void,
    options?: { width?: number; height?: number },
  ) => void;
};

type Layout = {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
};

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
    {
      document,
      remoteDrafts,
      presence,
      tool,
      color,
      width,
      paper,
      dark,
      onStrokeMove,
      onStrokeComplete,
      onCursorMove,
      onInteract,
      readOnly = false,
    },
    ref,
  ) {
    const svgRef = useRef<SvgCapture | null>(null);
    const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
    const [layout, setLayout] = useState<Layout | null>(null);
    const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
    const layoutRef = useRef<Layout>({
      width: 1,
      height: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    const currentRef = useRef<Stroke | null>(null);
    const startRef = useRef(0);
    const cursorAt = useRef(0);
    const draftAt = useRef(0);
    const rafRef = useRef<number | null>(null);
    const pendingLive = useRef<Stroke | null>(null);
    const callbacks = useRef({
      onStrokeMove,
      onStrokeComplete,
      onCursorMove,
      onInteract,
    });
    callbacks.current = {
      onStrokeMove,
      onStrokeComplete,
      onCursorMove,
      onInteract,
    };

    const toolRef = useRef({ tool, color, width });
    toolRef.current = { tool, color, width };
    const boardRef = useRef(document.canvas);
    boardRef.current = document.canvas;

    const scheduleLive = (stroke: Stroke | null) => {
      pendingLive.current = stroke;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setLiveStroke(pendingLive.current);
      });
    };

    useImperativeHandle(ref, () => ({
      capturePng: () =>
        new Promise((resolve, reject) => {
          const node = svgRef.current;
          if (!node?.toDataURL) {
            reject(new Error("Could not capture the board"));
            return;
          }
          const timer = setTimeout(() => {
            reject(new Error("Snapshot timed out"));
          }, 8000);
          node.toDataURL(
            (data) => {
              clearTimeout(timer);
              const base64 = data.includes(",") ? data.split(",").pop() ?? data : data;
              if (!base64) {
                reject(new Error("Could not encode snapshot"));
                return;
              }
              resolve(base64);
            },
            { width: document.canvas.width, height: document.canvas.height },
          );
        }),
    }));

    const originRef = useRef({ x: 0, y: 0 });
    const wrapRef = useRef<View>(null);

    const toDoc = (pageX: number, pageY: number) => {
      const { zoom, panX, panY } = layoutRef.current;
      const { x, y } = originRef.current;
      return {
        x: (pageX - x - panX) / Math.max(0.0001, zoom),
        y: (pageY - y - panY) / Math.max(0.0001, zoom),
      };
    };

    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => !readOnlyRef.current,
          onMoveShouldSetPanResponder: () => !readOnlyRef.current,
          onPanResponderGrant: (event) => {
            callbacks.current.onInteract?.();
            const { pageX, pageY, locationX, locationY } = event.nativeEvent;
            originRef.current = { x: pageX - locationX, y: pageY - locationY };
            const localX = pageX - originRef.current.x;
            const localY = pageY - originRef.current.y;
            if (toolRef.current.tool === "eraser") {
              setEraserPos({ x: localX, y: localY });
            }
            const point = toDoc(pageX, pageY);
            startRef.current = Date.now();
            const stroke: Stroke = {
              id: newStrokeId(),
              color: toolRef.current.color,
              width: toolRef.current.width,
              tool: toolRef.current.tool,
              points: [{ x: point.x, y: point.y, t: 0 }],
            };
            currentRef.current = stroke;
            setLiveStroke(stroke);
            callbacks.current.onStrokeMove(stroke);
          },
          onPanResponderMove: (event) => {
            const { pageX, pageY, locationX, locationY } = event.nativeEvent;
            originRef.current = { x: pageX - locationX, y: pageY - locationY };
            const localX = pageX - originRef.current.x;
            const localY = pageY - originRef.current.y;
            if (toolRef.current.tool === "eraser") {
              setEraserPos({ x: localX, y: localY });
            }
            const point = toDoc(pageX, pageY);
            const now = Date.now();
            if (now - cursorAt.current > 80) {
              cursorAt.current = now;
              callbacks.current.onCursorMove(point.x, point.y);
            }
            if (!currentRef.current) return;
            const next: Stroke = {
              ...currentRef.current,
              points: [
                ...currentRef.current.points,
                { x: point.x, y: point.y, t: now - startRef.current },
              ],
            };
            currentRef.current = next;
            scheduleLive(next);
            if (now - draftAt.current > 80) {
              draftAt.current = now;
              callbacks.current.onStrokeMove(next);
            }
          },
          onPanResponderRelease: () => {
            setEraserPos(null);
            const stroke = currentRef.current;
            currentRef.current = null;
            if (rafRef.current != null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setLiveStroke(null);
            callbacks.current.onStrokeMove(null);
            callbacks.current.onCursorMove();
            if (stroke && stroke.points.length > 0) {
              callbacks.current.onStrokeComplete(stroke);
            }
          },
          onPanResponderTerminate: () => {
            setEraserPos(null);
            const stroke = currentRef.current;
            currentRef.current = null;
            if (rafRef.current != null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setLiveStroke(null);
            callbacks.current.onStrokeMove(null);
            callbacks.current.onCursorMove();
            if (stroke && stroke.points.length > 0) {
              callbacks.current.onStrokeComplete(stroke);
            }
          },
        }),
      [],
    );

    const strokes = [
      ...document.strokes,
      ...remoteDrafts,
      ...(liveStroke ? [liveStroke] : []),
    ];
    const eraser = tool === "eraser";
    const zoom = layout?.zoom ?? 1;
    const cursor = width * zoom;
    const viewDocX = layout ? -layout.panX / Math.max(0.0001, layout.zoom) : 0;
    const viewDocY = layout ? -layout.panY / Math.max(0.0001, layout.zoom) : 0;
    const viewDocW = layout ? layout.width / Math.max(0.0001, layout.zoom) : 1;
    const viewDocH = layout ? layout.height / Math.max(0.0001, layout.zoom) : 1;

    return (
      <View
        ref={wrapRef}
        collapsable={false}
        pointerEvents="box-only"
        className="flex-1 overflow-hidden rounded-nova"
        style={{
          backgroundColor: paper,
          borderWidth: 1,
          borderColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(42, 22, 6, 0.14)",
        }}
        onLayout={(event) => {
          const { width: measuredW, height: measuredH } = event.nativeEvent.layout;
          const fitted = fitBoard(
            measuredW,
            measuredH,
            boardRef.current.width,
            boardRef.current.height,
          );
          const next = {
            width: measuredW,
            height: measuredH,
            ...fitted,
          };
          const prev = layoutRef.current;
          wrapRef.current?.measureInWindow((x, y) => {
            originRef.current = { x, y };
          });
          if (
            prev.width === next.width &&
            prev.height === next.height &&
            prev.zoom === next.zoom &&
            prev.panX === next.panX &&
            prev.panY === next.panY
          ) {
            return;
          }
          layoutRef.current = next;
          setLayout(next);
        }}
        {...panResponder.panHandlers}
      >
        {layout ? (
        <Svg
          pointerEvents="none"
          ref={(node) => {
            svgRef.current = node as unknown as SvgCapture | null;
          }}
          width={layout.width}
          height={layout.height}
          viewBox={`${viewDocX} ${viewDocY} ${viewDocW} ${viewDocH}`}
          preserveAspectRatio="none"
        >
          <Path
            d={`M ${viewDocX} ${viewDocY} H ${viewDocX + viewDocW} V ${viewDocY + viewDocH} H ${viewDocX} Z`}
            fill={paper}
          />
          {strokes.map((stroke) => (
            <Path
              key={stroke.id}
              d={strokeToPath(stroke)}
              stroke={strokeColor(stroke, paper)}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={strokeOpacity(stroke, dark)}
            />
          ))}
          {presence.map((peer) =>
            peer.isSelf || !peer.drawing || peer.x == null || peer.y == null ? null : (
              <Circle
                key={peer.userId}
                cx={peer.x}
                cy={peer.y}
                r={14}
                fill={peer.color}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={3}
              />
            ),
          )}
        </Svg>
        ) : null}
        {eraser && eraserPos ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: eraserPos.x - cursor / 2,
              top: eraserPos.y - cursor / 2,
              width: cursor,
              height: cursor,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: dark ? "rgba(255,255,255,0.75)" : "rgba(42,22,6,0.7)",
              backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(42,22,6,0.08)",
            }}
          />
        ) : null}
      </View>
    );
  },
);
