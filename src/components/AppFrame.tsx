import { useEffect, useState, type PropsWithChildren } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DynamicLogo } from "@/components/UI/DynamicLogo";
import { getPalette } from "@/theme/colors";

const tabs = [
  { href: "/(main)/dashboard", label: "Dashboard", icon: "grid-outline" },
  { href: "/(main)/projects", label: "Projects", icon: "folder-open-outline" },
  { href: "/(main)/timeline", label: "Timeline", icon: "git-compare-outline" },
  { href: "/(main)/profile", label: "Profile", icon: "person-outline" },
] as const;

export function AppFrame({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <View
        className="min-h-[82px] flex-row items-center gap-5 border-b border-glass bg-sidebar px-4 pb-2.5 dark:border-dark-glass dark:bg-dark-sidebar"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to dashboard"
          onPress={() => router.push("/(main)/dashboard")}
          className="items-center justify-center active:opacity-75"
        >
          <DynamicLogo size={40} />
        </Pressable>

        <View className="flex-1 flex-row items-center justify-end gap-3">
          <Pressable
            accessibilityLabel="Search"
            accessibilityRole="button"
            onPress={() => router.push("/(main)/search")}
            className="h-[42px] flex-1 flex-row items-center gap-2 rounded-[14px] border border-glass bg-glass-button px-3 active:opacity-70 dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="search-outline" size={18} color={palette.muted} />
            <Text className="text-[13px] font-semibold text-muted dark:text-dark-muted">Search</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            onPress={() => router.push("/(main)/notifications")}
            className="h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-glass bg-glass-button active:opacity-70 dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="notifications-outline" size={20} color={palette.muted} />
          </Pressable>

          {/* <Pressable
            accessibilityLabel="Profile"
            accessibilityRole="button"
            onPress={() => router.push("/(main)/profile")}
            className="h-[42px] w-[42px] items-center justify-center rounded-full border border-glass bg-accent active:opacity-75"
          >
            <Text className="text-[13px] font-black text-white">
              {getInitials(user?.fullName)}
            </Text>
          </Pressable> */}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 82 : 0}
        className="flex-1"
      >
        <View className="flex-1">{children}</View>
      </KeyboardAvoidingView>

      {keyboardVisible ? null : (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 bg-transparent px-3"
          style={{ bottom: insets.bottom + 8 }}
        >
          <View className="relative flex-row gap-2 rounded-nova-lg border border-glass bg-sidebar shadow-lg shadow-black/20 dark:border-dark-glass dark:bg-dark-sidebar">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href.replace("/(main)", "") ||
              pathname === tab.href ||
              (tab.href.endsWith("dashboard") && pathname === "/");

              return (
              <Pressable
              key={tab.href}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                onPress={() => router.push(tab.href)}
                className={`min-h-[58px] flex-1 items-center justify-center gap-[5px] rounded-nova-lg border ${
                  active ? "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button" : "border-transparent"
                } active:opacity-75`}
                >
                <Ionicons
                  name={tab.icon}
                  size={20}
                  color={active ? palette.accent : palette.muted}
                />
                <Text
                  className={`text-[11px] font-extrabold ${
                    active ? "text-accent dark:text-dark-accent" : "text-muted dark:text-dark-muted"
                  }`}
                  >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          </View>
        </View>
      )}
    </View>
  );
}
