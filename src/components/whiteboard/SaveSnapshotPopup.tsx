import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { getPalette } from "@/theme/colors";

type SaveSnapshotPopupProps = {
  visible: boolean;
  saving?: boolean;
  canSave?: boolean;
  onSave: () => void;
  onSkip: () => void;
  onStay: () => void;
};

export function SaveSnapshotPopup({
  visible,
  saving,
  canSave = true,
  onSave,
  onSkip,
  onStay,
}: SaveSnapshotPopupProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={saving ? undefined : onStay}
    >
      <View className="flex-1 items-center justify-center bg-black/55 px-5">
        <View className="w-full max-w-[360px] rounded-nova-xl border border-glass bg-sidebar p-5 shadow-2xl shadow-black/40 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
              <Ionicons name="image-outline" size={22} color={palette.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-[19px] font-black text-primary dark:text-dark-primary">
                {canSave ? "Save board as an image?" : "Leave this board?"}
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted dark:text-dark-muted">
                {canSave
                  ? "Upload a PNG for this page. If it already has an image, the old one is replaced."
                  : "Your strokes stay on the board. Only admins can save pages as images."}
              </Text>
            </View>
          </View>

          <View className="mt-6 gap-2">
            {canSave ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save image"
              disabled={saving}
              onPress={onSave}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-nova bg-accent active:opacity-75 disabled:opacity-50 dark:bg-dark-accent"
            >
              {saving ? <ActivityIndicator color={palette.white} size="small" /> : null}
              <Text className="text-[14px] font-extrabold text-white">
                {saving ? "Saving…" : "Save image"}
              </Text>
            </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Don't save"
              disabled={saving}
              onPress={onSkip}
              className="min-h-[48px] items-center justify-center rounded-nova border border-glass bg-glass-card active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Text className="text-[14px] font-extrabold text-primary dark:text-dark-primary">
                Don’t save
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stay on board"
              disabled={saving}
              onPress={onStay}
              className="min-h-[44px] items-center justify-center active:opacity-75 disabled:opacity-50"
            >
              <Text className="text-[14px] font-bold text-muted dark:text-dark-muted">
                Stay
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
