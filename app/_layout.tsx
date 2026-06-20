import { useEffect } from "react";
import "../global.css";
import { Stack } from "expo-router";
import { useColorScheme } from "nativewind";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SnackbarHost } from "@/components/SnackbarHost";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppearanceStore } from "@/store/useAppearanceStore";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const hydrate = useAuthStore((state) => state.hydrate);
  const appearanceMode = useAppearanceStore((state) => state.mode);
  const appearanceHydrated = useAppearanceStore((state) => state.isHydrated);
  const hydrateAppearance = useAppearanceStore((state) => state.hydrate);
  const authenticated = Boolean(accessToken && user);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void hydrateAppearance();
  }, [hydrateAppearance]);

  useEffect(() => {
    if (appearanceHydrated) {
      setColorScheme(appearanceMode);
    }
  }, [appearanceHydrated, appearanceMode, setColorScheme]);

  useEffect(() => {
    if (isHydrated && appearanceHydrated) void SplashScreen.hideAsync();
  }, [appearanceHydrated, isHydrated]);

  if (!isHydrated || !appearanceHydrated) return null;

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colorScheme === "dark" ? "#161312" : "#f5f1ec" } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!authenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={authenticated}>
          <Stack.Screen name="(main)" />
        </Stack.Protected>
      </Stack>
      <SnackbarHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
