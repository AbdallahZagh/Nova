import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { getPalette } from "@/theme/colors";

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  password?: boolean;
};

export function FormField({
  label,
  error,
  hint,
  password,
  className,
  ...props
}: FormFieldProps & { className?: string }) {
  const [visible, setVisible] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <View className="gap-[7px]">
      <Text className="text-[13px] font-bold text-muted dark:text-dark-muted">{label}</Text>
      <View
        className={`min-h-[50px] flex-row items-center rounded-nova border bg-glass-button dark:bg-dark-glass-button ${
          error ? "border-danger dark:border-dark-danger" : "border-glass dark:border-dark-glass"
        }`}
      >
        <TextInput
          {...props}
          secureTextEntry={password && !visible}
          placeholderTextColor={palette.muted}
          selectionColor={palette.accent}
          className={`flex-1 px-3.5 py-3 text-[15px] text-primary dark:text-dark-primary ${className ?? ""}`}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible((current) => !current)}
            className="min-h-12 w-12 items-center justify-center"
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={21}
              color={palette.accent}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="text-xs leading-[17px] text-danger dark:text-dark-danger">{error}</Text>
      ) : hint ? (
        <Text className="text-xs leading-[17px] text-subtle dark:text-dark-subtle">{hint}</Text>
      ) : null}
    </View>
  );
}
