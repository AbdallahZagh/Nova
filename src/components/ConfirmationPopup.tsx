import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { getPalette } from "@/theme/colors";

type ConfirmationPopupProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "danger" | "accent";
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationPopup({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  icon = "alert-circle-outline",
  variant = "accent",
  loading,
  onCancel,
  onConfirm,
}: ConfirmationPopupProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const actionColor = variant === "danger" ? palette.danger : palette.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View className="flex-1 items-center justify-center bg-black/55 px-5">
        <View className="w-full max-w-[360px] rounded-nova-xl border border-glass bg-sidebar p-5 shadow-2xl shadow-black/40 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start gap-3">
            <View
              className={`h-11 w-11 items-center justify-center rounded-nova ${
                variant === "danger"
                  ? "bg-danger/10 dark:bg-dark-danger/10"
                  : "bg-accent/15 dark:bg-dark-accent/15"
              }`}
            >
              <Ionicons name={icon} size={22} color={actionColor} />
            </View>
            <View className="flex-1">
              <Text className="text-[19px] font-black text-primary dark:text-dark-primary">
                {title}
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted dark:text-dark-muted">
                {message}
              </Text>
            </View>
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              disabled={loading}
              onPress={onCancel}
              className="min-h-[48px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-card active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Text className="text-[14px] font-extrabold text-muted dark:text-dark-muted">
                {cancelLabel}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              disabled={loading}
              onPress={onConfirm}
              className={`min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-nova active:opacity-75 disabled:opacity-50 ${
                variant === "danger"
                  ? "bg-danger dark:bg-dark-danger"
                  : "bg-accent dark:bg-dark-accent"
              }`}
            >
              {loading ? <ActivityIndicator color={palette.white} size="small" /> : null}
              <Text className="text-[14px] font-extrabold text-white">
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
