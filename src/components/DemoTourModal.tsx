import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import {
  DEMO_TOUR_POINTS,
  dismissDemoTour,
  hasDismissedDemoTour,
} from "@/demo";
import { useAuthStore } from "@/store/useAuthStore";
import { getPalette } from "@/theme/colors";

export function DemoTourModal() {
  const user = useAuthStore((state) => state.user);
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.isDemo) {
      setOpen(false);
      return;
    }
    void hasDismissedDemoTour().then((dismissed) => {
      if (!cancelled && !dismissed) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.isDemo]);

  const close = () => {
    setOpen(false);
    void dismissDemoTour();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 justify-end bg-black/55 px-4 py-6 sm:items-center sm:justify-center">
        <View className="w-full max-w-[440px] self-center rounded-nova-xl border border-glass bg-sidebar p-5 shadow-2xl shadow-black/40 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-nova bg-accent/15 dark:bg-dark-accent/15">
              <Ionicons name="compass-outline" size={22} color={palette.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] font-extrabold uppercase tracking-[1.4px] text-accent dark:text-dark-accent">
                Demo workspace
              </Text>
              <Text className="mt-1 text-[19px] font-black text-primary dark:text-dark-primary">
                You are in a shared Nova sandbox
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted dark:text-dark-muted">
                Try the product. This account is public, so skip personal data.
              </Text>
            </View>
          </View>

          <ScrollView className="mt-5 max-h-[360px]" showsVerticalScrollIndicator={false}>
            <View className="gap-3">
              {DEMO_TOUR_POINTS.map((item) => (
                <View
                  key={item.title}
                  className="rounded-nova border border-glass bg-glass-card px-3.5 py-3 dark:border-dark-glass dark:bg-dark-glass-card"
                >
                  <Text className="text-[15px] font-extrabold text-primary dark:text-dark-primary">
                    {item.title}
                  </Text>
                  <Text className="mt-1 text-[13px] leading-5 text-muted dark:text-dark-muted">
                    {item.body}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Got it"
            onPress={close}
            className="mt-5 min-h-[50px] items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
          >
            <Text className="text-[15px] font-extrabold text-white">Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
