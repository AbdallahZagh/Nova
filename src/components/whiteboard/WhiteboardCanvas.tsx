import {
  forwardRef,
  memo,
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
  type WhiteboardPresence,
} from "@/api/whiteboards";
import { strokeColor, strokeOpacity, strokeToPath } from "@/whiteboard/render";

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

type LiveInkHandle = {
  update: (d: string, stroke: Stroke, paper: string, dark: boolean) => void;
  clear: () => void;
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

const StrokePath = memo(function StrokePath({
  stroke,
  paper,
  dark,
}: {
  stroke: Stroke;
  paper: string;
  dark: boolean;
}) {
  return (
    <Path
      d={strokeToPath(stroke)}
      stroke={strokeColor(stroke, paper)}
      strokeWidth={stroke.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity={strokeOpacity(stroke, dark)}
    />
  );
});

const LiveInk = memo(
  forwardRef<LiveInkHandle>(function LiveInk(_, ref) {
    const [ink, setInk] = useState({
      d: "",
      stroke: "#000000",
      strokeWidth: 4,
      opacity: 0,
    });

    useImperativeHandle(
      ref,
      () => ({
        update(d, stroke, paper, dark) {
          setInk({
            d,
            stroke: strokeColor(stroke, paper),
            strokeWidth: stroke.width,
            opacity: strokeOpacity(stroke, dark),
          });
        },
        clear() {
          setInk((current) =>
            current.d || current.opacity
              ? { d: "", stroke: current.stroke, strokeWidth: current.strokeWidth, opacity: 0 }
              : current,
          );
        },
      }),
      [],
    );

    return (
      <Path
        d={ink.d}
        stroke={ink.stroke}
        strokeWidth={ink.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={ink.opacity}
      />
    );
  }),
);

export const WhiteboardCanvas = memo(
  forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
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
      const liveInkRef = useRef<LiveInkHandle | null>(null);
      const liveDRef = useRef("");
      const [layout, setLayout] = useState<Layout | null>(null);
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
      const lastPointRef = useRef({ x: 0, y: 0 });
      const originRef = useRef({ x: 0, y: 0 });
      const wrapRef = useRef<View>(null);
      const eraserRef = useRef<View>(null);
      const eraserSizeRef = useRef(1);
      const documentRef = useRef(document);
      documentRef.current = document;
      const readOnlyRef = useRef(readOnly);
      readOnlyRef.current = readOnly;

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

      const toolRef = useRef({ tool, color, width, paper, dark });
      toolRef.current = { tool, color, width, paper, dark };
      const boardRef = useRef(document.canvas);
      boardRef.current = document.canvas;

      const setEraserCursor = (x: number, y: number, visible: boolean) => {
        const size = eraserSizeRef.current;
        eraserRef.current?.setNativeProps({
          style: {
            opacity: visible ? 1 : 0,
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size,
          },
        });
      };

      const paintLive = (stroke: Stroke | null) => {
        if (!stroke) {
          liveDRef.current = "";
          liveInkRef.current?.clear();
          return;
        }
        liveInkRef.current?.update(
          liveDRef.current,
          stroke,
          toolRef.current.paper,
          toolRef.current.dark,
        );
      };

      const toDoc = (pageX: number, pageY: number) => {
        const { zoom, panX, panY } = layoutRef.current;
        const { x, y } = originRef.current;
        return {
          x: (pageX - x - panX) / Math.max(0.0001, zoom),
          y: (pageY - y - panY) / Math.max(0.0001, zoom),
        };
      };

      const beginStroke = (
        pageX: number,
        pageY: number,
        locationX: number,
        locationY: number,
      ) => {
        if (readOnlyRef.current) return;
        callbacks.current.onInteract?.();
        originRef.current = { x: pageX - locationX, y: pageY - locationY };
        if (toolRef.current.tool === "eraser") {
          setEraserCursor(locationX, locationY, true);
        }
        const point = toDoc(pageX, pageY);
        startRef.current = Date.now();
        lastPointRef.current = point;
        liveDRef.current = `M ${point.x} ${point.y} L ${point.x + 0.1} ${point.y}`;
        const stroke: Stroke = {
          id: newStrokeId(),
          color: toolRef.current.color,
          width: toolRef.current.width,
          tool: toolRef.current.tool,
          points: [{ x: point.x, y: point.y, t: 0 }],
        };
        currentRef.current = stroke;
        paintLive(stroke);
        callbacks.current.onStrokeMove(stroke);
      };

      const moveStroke = (
        pageX: number,
        pageY: number,
        locationX: number,
        locationY: number,
      ) => {
        if (readOnlyRef.current) return;
        originRef.current = { x: pageX - locationX, y: pageY - locationY };
        if (toolRef.current.tool === "eraser") {
          setEraserCursor(locationX, locationY, true);
        }
        const point = toDoc(pageX, pageY);
        const now = Date.now();
        if (now - cursorAt.current > 80) {
          cursorAt.current = now;
          callbacks.current.onCursorMove(point.x, point.y);
        }
        if (!currentRef.current) return;
        currentRef.current.points.push({
          x: point.x,
          y: point.y,
          t: now - startRef.current,
        });
        lastPointRef.current = point;
        liveDRef.current += ` L ${point.x} ${point.y}`;
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            paintLive(currentRef.current);
          });
        }
        if (now - draftAt.current > 80) {
          draftAt.current = now;
          callbacks.current.onStrokeMove(currentRef.current);
        }
      };

      const endStroke = () => {
        setEraserCursor(0, 0, false);
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const stroke = currentRef.current;
        currentRef.current = null;
        paintLive(null);
        callbacks.current.onStrokeMove(null);
        callbacks.current.onCursorMove();
        if (stroke && stroke.points.length > 0) {
          callbacks.current.onStrokeComplete(stroke);
        }
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
              {
                width: documentRef.current.canvas.width,
                height: documentRef.current.canvas.height,
              },
            );
          }),
      }));

      const panResponder = useMemo(
        () =>
          PanResponder.create({
            onStartShouldSetPanResponder: () => !readOnlyRef.current,
            onMoveShouldSetPanResponder: () => !readOnlyRef.current,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (event) => {
              const { pageX, pageY, locationX, locationY } = event.nativeEvent;
              beginStroke(pageX, pageY, locationX, locationY);
            },
            onPanResponderMove: (event) => {
              const { pageX, pageY, locationX, locationY } = event.nativeEvent;
              moveStroke(pageX, pageY, locationX, locationY);
            },
            onPanResponderRelease: endStroke,
            onPanResponderTerminate: endStroke,
          }),
        // Handlers read refs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
      );

      const eraser = tool === "eraser";
      eraserSizeRef.current = width * (layout?.zoom ?? 1);
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
            borderColor: dark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(42, 22, 6, 0.14)",
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
              {document.strokes.map((stroke) => (
                <StrokePath
                  key={stroke.id}
                  stroke={stroke}
                  paper={paper}
                  dark={dark}
                />
              ))}
              {remoteDrafts.map((stroke) => (
                <StrokePath
                  key={stroke.id}
                  stroke={stroke}
                  paper={paper}
                  dark={dark}
                />
              ))}
              <LiveInk key="live-ink" ref={liveInkRef} />
              {presence.map((peer) =>
                peer.isSelf ||
                !peer.drawing ||
                peer.x == null ||
                peer.y == null ? null : (
                  <Circle
                    key={`${peer.userId}-${peer.platform}`}
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
          <View
            ref={eraserRef}
            pointerEvents="none"
            style={{
              position: "absolute",
              opacity: 0,
              left: 0,
              top: 0,
              width: eraserSizeRef.current,
              height: eraserSizeRef.current,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: dark
                ? "rgba(255,255,255,0.75)"
                : "rgba(42,22,6,0.7)",
              backgroundColor: dark
                ? "rgba(255,255,255,0.08)"
                : "rgba(42,22,6,0.08)",
              display: eraser ? "flex" : "none",
            }}
          />
        </View>
      );
    },
  ),
);
