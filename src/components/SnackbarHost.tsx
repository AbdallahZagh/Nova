import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type SnackbarVariant,
  useSnackbarStore,
} from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

const variantIcon: Record<SnackbarVariant, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle-outline",
  error: "alert-circle-outline",
  warning: "warning-outline",
  info: "information-circle-outline",
};

export function SnackbarHost() {
  const visible = useSnackbarStore((state) => state.visible);
  const title = useSnackbarStore((state) => state.title);
  const message = useSnackbarStore((state) => state.message);
  const variant = useSnackbarStore((state) => state.variant);
  const hideSnackbar = useSnackbarStore((state) => state.hideSnackbar);
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const insets = useSafeAreaInsets();

  const color =
    variant === "success"
      ? palette.success
      : variant === "error"
        ? palette.danger
        : variant === "warning"
          ? palette.warning
          : palette.accent;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(hideSnackbar, 3200);
    return () => clearTimeout(timer);
  }, [hideSnackbar, visible]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 z-50 px-4"
      style={{ bottom: insets.bottom + 92 }}
    >
      <View
        className="flex-row items-center gap-3 rounded-[20px] border bg-sidebar px-4 py-3 shadow-lg shadow-black/25 dark:bg-dark-sidebar"
        style={{ borderColor: color }}
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-glass-button dark:bg-dark-glass-button">
          <Ionicons name={variantIcon[variant]} size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-extrabold" style={{ color }}>
            {title}
          </Text>
          {message ? (
            <Text className="mt-0.5 text-xs leading-4 text-muted dark:text-dark-muted">
              {message}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          onPress={hideSnackbar}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
        >
          <Ionicons name="close-outline" size={18} color={palette.muted} />
        </Pressable>
      </View>
    </View>
  );
}
