import { Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppPalette } from "@/theme/useAppPalette";

export type ActionSheetItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: ActionSheetItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppPalette();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="px-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="overflow-hidden rounded-nova-xl border border-glass bg-sidebar dark:border-dark-glass dark:bg-dark-sidebar">
            {title ? (
              <Text className="px-4 py-3 text-center text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
                {title}
              </Text>
            ) : null}
            {actions.map((item, index) => (
              <Pressable
                key={item.key}
                disabled={item.disabled}
                onPress={item.onPress}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-glass-button dark:active:bg-dark-glass-button ${
                  index > 0 || title
                    ? "border-t border-glass dark:border-dark-glass"
                    : ""
                } ${item.disabled ? "opacity-50" : ""}`}
              >
                <Ionicons name={item.icon} size={18} color={palette.primary} />
                <Text className="flex-1 text-[15px] font-extrabold text-primary dark:text-dark-primary">
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            className="mt-2 min-h-[50px] items-center justify-center rounded-nova-xl border border-glass bg-sidebar active:opacity-80 dark:border-dark-glass dark:bg-dark-sidebar"
          >
            <Text className="text-[15px] font-black text-muted dark:text-dark-muted">
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
