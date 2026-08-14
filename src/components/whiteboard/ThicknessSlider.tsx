import { useRef } from "react";
import { PanResponder, View } from "react-native";

type ThicknessSliderProps = {
  value: number;
  min: number;
  max: number;
  accent: string;
  track: string;
  showFill?: boolean;
  onChange: (value: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ThicknessSlider({
  value,
  min,
  max,
  accent,
  track,
  showFill = true,
  onChange,
}: ThicknessSliderProps) {
  const viewRef = useRef<View>(null);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  minRef.current = min;
  maxRef.current = max;
  onChangeRef.current = onChange;

  const setFromPageX = (pageX: number) => {
    viewRef.current?.measureInWindow((x, _y, width) => {
      const ratio = clamp((pageX - x) / Math.max(1, width), 0, 1);
      const next = Math.round(
        minRef.current + ratio * (maxRef.current - minRef.current),
      );
      onChangeRef.current(next);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => setFromPageX(event.nativeEvent.pageX),
      onPanResponderMove: (event) => setFromPageX(event.nativeEvent.pageX),
    }),
  ).current;

  const ratio = clamp((value - min) / Math.max(1, max - min), 0, 1);

  return (
    <View
      ref={viewRef}
      className="relative h-10 flex-1 justify-center"
      {...pan.panHandlers}
    >
      <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: track }}>
        {showFill ? (
          <View
            className="h-full rounded-full"
            style={{ width: `${Math.max(6, ratio * 100)}%`, backgroundColor: accent }}
          />
        ) : null}
      </View>
      <View
        pointerEvents="none"
        className="absolute size-5 rounded-full border-2 border-white"
        style={{
          left: `${ratio * 100}%`,
          marginLeft: -10,
          backgroundColor: accent,
        }}
      />
    </View>
  );
}
