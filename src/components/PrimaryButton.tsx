import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
} from "react-native";
import { colors } from "@/theme/colors";

type PrimaryButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
};

export function PrimaryButton({
  label,
  loading,
  disabled,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={isDisabled}
      className={`min-h-[50px] flex-row items-center justify-center gap-2 rounded-nova bg-accent px-4 dark:bg-dark-accent ${
        isDisabled ? "opacity-50" : "active:bg-accent-pressed"
      }`}
    >
      {loading ? <ActivityIndicator color={colors.white} size="small" /> : null}
      <Text className="text-[15px] font-extrabold text-white">{label}</Text>
    </Pressable>
  );
}
