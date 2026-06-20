import { useRef } from "react";
import {
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { colors } from "@/theme/colors";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
};

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
}: OtpInputProps) {
  const refs = useRef<(TextInput | null)[]>([]);

  const setDigit = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 1) {
      const pasted = digits.slice(0, length);
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
      return;
    }

    const next = Array.from({ length }, (_, position) => value[position] ?? "");
    next[index] = digits.slice(-1);
    onChange(next.join("").slice(0, length));
    if (digits && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View className="flex-row justify-center gap-[7px]">
      {Array.from({ length }, (_, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={value[index] ?? ""}
          onChangeText={(text) => setDigit(index, text)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={index === 0 ? length : 1}
          selectTextOnFocus
          selectionColor={colors.accent}
          className={`h-[52px] w-11 rounded-nova border bg-glass-button text-center text-xl font-extrabold text-primary dark:bg-dark-glass-button dark:text-dark-primary ${
            value[index] ? "border-accent dark:border-dark-accent" : "border-glass dark:border-dark-glass"
          } ${disabled ? "opacity-55" : ""}`}
        />
      ))}
    </View>
  );
}
