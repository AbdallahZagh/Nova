import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string) {
  const value = hex.replace("#", "");
  const raw =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const num = Number.parseInt(raw, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type ColorPadProps = {
  onPick: (pageX: number, pageY: number, width: number, height: number, originX: number, originY: number) => void;
  children: ReactNode;
  height: number;
};

function ColorPad({ onPick, children, height }: ColorPadProps) {
  const viewRef = useRef<View>(null);

  const pick = (pageX: number, pageY: number) => {
    viewRef.current?.measureInWindow((x, y, width, measuredHeight) => {
      onPick(pageX, pageY, width, measuredHeight, x, y);
    });
  };

  return (
    <View
      ref={viewRef}
      style={{ height, borderRadius: 16, overflow: "hidden" }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) =>
        pick(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
      onResponderMove={(event) =>
        pick(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
    >
      {children}
    </View>
  );
}

type ColorPickerModalProps = {
  visible: boolean;
  color: string;
  onClose: () => void;
  onSelect: (color: string) => void;
};

export function ColorPickerModal({
  visible,
  color,
  onClose,
  onSelect,
}: ColorPickerModalProps) {
  const initial = hexToHsv(color.startsWith("#") ? color : "#e66a17");
  const [hue, setHue] = useState(initial.h);
  const [sat, setSat] = useState(initial.s);
  const [val, setVal] = useState(initial.v);

  useEffect(() => {
    if (!visible) return;
    const next = hexToHsv(color.startsWith("#") ? color : "#e66a17");
    setHue(next.h);
    setSat(next.s);
    setVal(next.v);
  }, [color, visible]);

  const preview = hsvToHex(hue, sat, val);
  const hueColor = hsvToHex(hue, 1, 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/55 px-5">
        <View className="w-full max-w-[360px] rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="text-[19px] font-black text-primary dark:text-dark-primary">
            Pick a color
          </Text>

          <View className="mt-4 overflow-hidden rounded-nova">
            <ColorPad
              height={168}
              onPick={(pageX, pageY, width, height, originX, originY) => {
                setSat(clamp((pageX - originX) / Math.max(1, width), 0, 1));
                setVal(clamp(1 - (pageY - originY) / Math.max(1, height), 0, 1));
              }}
            >
              <View style={{ flex: 1, backgroundColor: hueColor }}>
                <LinearGradient
                  colors={["#ffffff", "rgba(255,255,255,0)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={["rgba(0,0,0,0)", "#000000"]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                  pointerEvents="none"
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: `${sat * 100}%`,
                    top: `${(1 - val) * 100}%`,
                    width: 18,
                    height: 18,
                    marginLeft: -9,
                    marginTop: -9,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: "#fff",
                  }}
                />
              </View>
            </ColorPad>
          </View>

          <View className="mt-3 overflow-hidden rounded-full">
            <ColorPad
              height={22}
              onPick={(pageX, _pageY, width, _height, originX) => {
                setHue(clamp(((pageX - originX) / Math.max(1, width)) * 360, 0, 360));
              }}
            >
              <LinearGradient
                colors={["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
                pointerEvents="none"
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 1,
                  left: `${(hue / 360) * 100}%`,
                  width: 18,
                  height: 18,
                  marginLeft: -9,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: "#fff",
                  backgroundColor: hueColor,
                }}
              />
            </ColorPad>
          </View>

          <View className="mt-3 flex-row items-center gap-3">
            <View
              className="size-8 rounded-nova border border-glass dark:border-dark-glass"
              style={{ backgroundColor: preview }}
            />
            <Text className="text-xs font-extrabold uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
              {preview}
            </Text>
          </View>

          <View className="mt-5 flex-row gap-3">
            <Pressable
              onPress={onClose}
              className="min-h-[48px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Text className="text-[14px] font-extrabold text-muted dark:text-dark-muted">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSelect(preview);
                onClose();
              }}
              className="min-h-[48px] flex-1 items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
            >
              <Text className="text-[14px] font-extrabold text-white">Use color</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
