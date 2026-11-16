import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NOTE_COLORS, NOTE_COLOR_LABEL, NOTE_DOT, type NoteColor } from "@/notes";

export function NoteColorDots({
  value,
  onChange,
  size = 30,
}: {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  size?: number;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {NOTE_COLORS.map((color) => {
        const active = value === color;
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={NOTE_COLOR_LABEL[color]}
            onPress={() => onChange(color)}
            hitSlop={6}
            className="items-center justify-center rounded-full active:opacity-75"
            style={{
              width: size,
              height: size,
              backgroundColor: NOTE_DOT[color],
              borderWidth: active ? 2.5 : 0,
              borderColor: "rgba(0,0,0,0.55)",
            }}
          >
            {active ? <Ionicons name="checkmark" size={size * 0.55} color="rgba(0,0,0,0.7)" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
