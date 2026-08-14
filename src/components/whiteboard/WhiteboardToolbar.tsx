import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  DEFAULT_TOOL_WIDTH,
  ERASER_WIDTH_MAX,
  ERASER_WIDTH_MIN,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  type StrokeTool,
} from "@/api/whiteboards";
import {
  EraserIcon,
  HighlighterIcon,
  PenIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "@/components/whiteboard/BoardToolIcons";
import { ColorPickerModal } from "@/components/whiteboard/ColorPickerModal";
import { ThicknessSlider } from "@/components/whiteboard/ThicknessSlider";

const TOOLS: {
  id: StrokeTool;
  label: string;
  Icon: typeof PenIcon;
}[] = [
  { id: "pen", label: "Pen", Icon: PenIcon },
  { id: "highlighter", label: "Highlighter", Icon: HighlighterIcon },
  { id: "eraser", label: "Eraser", Icon: EraserIcon },
];

type WhiteboardToolbarProps = {
  tool: StrokeTool;
  color: string;
  width: number;
  colors: readonly string[];
  canUndo: boolean;
  canRedo: boolean;
  accent: string;
  muted: string;
  danger: string;
  track: string;
  onToolChange: (tool: StrokeTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  overlay?: boolean;
};

function toHex(color: string) {
  return color.trim().toLowerCase();
}

export function WhiteboardToolbar({
  tool,
  color,
  width,
  colors,
  canUndo,
  canRedo,
  accent,
  muted,
  danger,
  track,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
  onClear,
  overlay = false,
}: WhiteboardToolbarProps) {
  const widthsRef = useRef<Record<StrokeTool, number>>({ ...DEFAULT_TOOL_WIDTH });
  widthsRef.current[tool] = width;
  const [pickerOpen, setPickerOpen] = useState(false);
  const hex = toHex(color);
  const presetSelected = colors.some((value) => toHex(value) === hex);
  const eraser = tool === "eraser";
  const min = eraser ? ERASER_WIDTH_MIN : STROKE_WIDTH_MIN;
  const max = eraser ? ERASER_WIDTH_MAX : STROKE_WIDTH_MAX;

  const handleTool = (next: StrokeTool) => {
    onToolChange(next);
    onWidthChange(widthsRef.current[next]);
  };

  return (
    <View
      className={`gap-1.5 rounded-nova border border-glass px-2 py-1.5 dark:border-dark-glass ${
        overlay
          ? "bg-sidebar dark:bg-dark-sidebar"
          : "mb-3 bg-glass-card dark:bg-dark-glass-card"
      }`}
    >
      <View className="flex-row items-center">
        {TOOLS.map((item) => (
          <Pressable
            key={item.id}
            accessibilityLabel={item.label}
            onPress={() => handleTool(item.id)}
            className={`rounded-xl p-2 ${tool === item.id ? "bg-accent/20" : ""}`}
          >
            <item.Icon color={tool === item.id ? accent : muted} size={16} />
          </Pressable>
        ))}
        <View className="flex-1" />
        <Pressable onPress={onUndo} disabled={!canUndo} className="p-2">
          <UndoIcon color={muted} size={16} />
        </Pressable>
        <Pressable onPress={onRedo} disabled={!canRedo} className="p-2">
          <RedoIcon color={muted} size={16} />
        </Pressable>
        <Pressable
          onPress={onClear}
          className="min-h-[36px] flex-row items-center gap-1.5 rounded-xl px-2"
        >
          <TrashIcon color={danger} size={16} />
          <Text className="text-[12px] font-extrabold" style={{ color: danger }}>
            Clear
          </Text>
        </Pressable>
      </View>

      <View className="gap-2">
        {eraser ? null : (
          <View className="flex-row flex-wrap items-center gap-2">
            {colors.map((value) => (
              <Pressable
                key={value}
                onPress={() => onColorChange(value)}
                className="size-8 items-center justify-center rounded-full border"
                style={{
                  borderWidth: 2,
                  borderColor: toHex(value) === hex ? muted : "transparent",
                }}
              >
                <View className="size-5 rounded-full" style={{ backgroundColor: value }} />
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel="Pick any color"
              hitSlop={8}
              onPress={() => setPickerOpen(true)}
              className="size-8 items-center justify-center rounded-full border"
              style={{ borderColor: presetSelected ? "transparent" : accent }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 20, height: 20, borderRadius: 999 }}
              />
            </Pressable>
          </View>
        )}

        <View className="flex-row items-center gap-3 px-1">
          <View
            className="rounded-full"
            style={{
              width: Math.max(8, Math.min(28, width)),
              height: Math.max(8, Math.min(28, width)),
              backgroundColor: eraser ? muted : color,
              opacity: tool === "highlighter" ? 0.45 : 1,
            }}
          />
          <ThicknessSlider
            value={width}
            min={min}
            max={max}
            accent={accent}
            track={track}
            onChange={onWidthChange}
          />
          <Text className="w-7 text-xs font-bold text-muted dark:text-dark-muted">
            {width}
          </Text>
        </View>
      </View>

      <ColorPickerModal
        visible={pickerOpen}
        color={color}
        onClose={() => setPickerOpen(false)}
        onSelect={onColorChange}
      />
    </View>
  );
}
