import { ActivityIndicator, Modal, Pressable, Switch, Text, View } from "react-native";
import { useAppPalette } from "@/theme/useAppPalette";

export function WhiteboardSettingsSheet({
  visible,
  autoSave,
  saving,
  onClose,
  onToggleAutoSave,
}: {
  visible: boolean;
  autoSave: boolean;
  saving?: boolean;
  onClose: () => void;
  onToggleAutoSave: () => void;
}) {
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
        <View className="px-3 pb-8">
          <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
            <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
              Board settings
            </Text>
            <View className="mt-4 flex-row items-center gap-4">
              <View className="flex-1">
                <Text className="text-[15px] font-extrabold text-primary dark:text-dark-primary">
                  Auto-save cover snapshot on exit
                </Text>
                <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                  Skip the exit prompt and save a new cover image in the background.
                </Text>
              </View>
              {saving ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <Switch
                  value={autoSave}
                  onValueChange={onToggleAutoSave}
                  trackColor={{ false: palette.glass, true: palette.accent }}
                  thumbColor={palette.white}
                />
              )}
            </View>
            <Pressable
              onPress={onClose}
              className="mt-5 min-h-[44px] items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Text className="text-sm font-black text-primary dark:text-dark-primary">
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
