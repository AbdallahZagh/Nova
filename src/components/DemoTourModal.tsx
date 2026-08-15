import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DEMO_TOUR_STEPS,
  dismissDemoTour,
  hasDismissedDemoTour,
  type DemoTourIcon,
} from "@/demo";
import { useAuthStore } from "@/store/useAuthStore";
import { getPalette } from "@/theme/colors";

const ICONS: Record<DemoTourIcon, keyof typeof Ionicons.glyphMap> = {
  sparkles: "sparkles-outline",
  folder: "folder-open-outline",
  calendar: "calendar-outline",
  pen: "brush-outline",
  moon: "moon-outline",
};

const HERO_HEIGHT = 148;
const FOOTER_HEIGHT = 76;

export function DemoTourModal() {
  const user = useAuthStore((state) => state.user);
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user?.isDemo) {
      setOpen(false);
      return;
    }
    void hasDismissedDemoTour().then((dismissed) => {
      if (!cancelled && !dismissed) {
        setStep(0);
        setOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.isDemo]);

  const finish = () => {
    setOpen(false);
    void dismissDemoTour();
  };

  const last = step >= DEMO_TOUR_STEPS.length - 1;
  const current = DEMO_TOUR_STEPS[step];
  const maxCardHeight = Math.min(height - insets.top - insets.bottom - 24, 720);
  const bodyMaxHeight = Math.max(220, maxCardHeight - HERO_HEIGHT - FOOTER_HEIGHT);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={finish}
    >
      <View
        className={colorScheme === "dark" ? "dark flex-1 justify-end px-3" : "flex-1 justify-end px-3"}
        style={{
          backgroundColor: "rgba(0,0,0,0.7)",
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: insets.top + 8,
        }}
      >
        {current ? (
          <View
            className="w-full max-w-[440px] self-center overflow-hidden rounded-[28px] border border-glass bg-sidebar dark:border-dark-glass dark:bg-dark-sidebar"
            style={{
              maxHeight: maxCardHeight,
              backgroundColor: palette.sidebar,
              borderColor: palette.glass,
            }}
          >
            <View className="relative overflow-hidden" style={{ height: HERO_HEIGHT }}>
              <View
                className="absolute inset-0"
                style={{ backgroundColor: `${palette.accent}33` }}
              />
              <Text
                className="absolute right-5 top-4 text-[11px] font-extrabold uppercase tracking-[2px]"
                style={{ color: palette.subtle }}
              >
                {step + 1} of {DEMO_TOUR_STEPS.length}
              </Text>
              <View
                className="absolute bottom-5 left-6 items-center justify-center rounded-[20px]"
                style={{
                  height: 68,
                  width: 68,
                  backgroundColor: palette.accent,
                }}
              >
                <Ionicons name={ICONS[current.icon]} size={30} color={palette.white} />
              </View>
            </View>

            <ScrollView
              key={current.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: bodyMaxHeight }}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}
            >
              <Text
                className="text-[11px] font-extrabold uppercase tracking-[2px]"
                style={{ color: palette.accent }}
              >
                {current.eyebrow}
              </Text>
              <Text
                className="mt-2 text-[26px] font-black leading-8"
                style={{ color: palette.primary }}
              >
                {current.title}
              </Text>
              <View className="mt-4 gap-3">
                {current.paragraphs.map((paragraph) => (
                  <Text
                    key={paragraph}
                    className="text-[15px] leading-[23px]"
                    style={{ color: palette.muted }}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
              {current.highlights?.length ? (
                <View className="mt-5 flex-row flex-wrap gap-2">
                  {current.highlights.map((item) => (
                    <View
                      key={item}
                      className="rounded-full px-3 py-1.5"
                      style={{
                        borderWidth: 1,
                        borderColor: `${palette.accent}40`,
                        backgroundColor: `${palette.accent}22`,
                      }}
                    >
                      <Text
                        className="text-[11px] font-extrabold"
                        style={{ color: palette.accent }}
                      >
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            <View className="flex-row items-center gap-2 px-4 py-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip"
                onPress={finish}
                hitSlop={8}
                className="px-1 py-2"
              >
                <Text className="text-[13px] font-bold" style={{ color: palette.muted }}>
                  Skip
                </Text>
              </Pressable>
              <View className="flex-1 flex-row items-center justify-center gap-1.5">
                {DEMO_TOUR_STEPS.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${item.eyebrow}`}
                    onPress={() => setStep(index)}
                    hitSlop={8}
                    style={{
                      height: 6,
                      width: index === step ? 24 : 6,
                      borderRadius: 99,
                      backgroundColor:
                        index === step ? palette.accent : palette.subtle,
                    }}
                  />
                ))}
              </View>
              {step > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => setStep((value) => value - 1)}
                  className="h-11 w-11 items-center justify-center rounded-nova border"
                  style={{
                    borderColor: palette.glass,
                    backgroundColor: palette.glassButton,
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color={palette.primary} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={last ? "Start exploring" : "Next"}
                onPress={() => (last ? finish() : setStep((value) => value + 1))}
                className="min-h-11 flex-row items-center justify-center gap-1 rounded-nova px-4"
                style={{ backgroundColor: palette.accent }}
              >
                <Text className="text-[14px] font-extrabold text-white">
                  {last ? "Start exploring" : "Next"}
                </Text>
                {last ? null : (
                  <Ionicons name="chevron-forward" size={16} color={palette.white} />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
