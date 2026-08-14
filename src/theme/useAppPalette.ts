import { useColorScheme as useRnColorScheme } from "react-native";
import { useColorScheme } from "nativewind";
import { useAppearanceStore } from "@/store/useAppearanceStore";
import { getPalette } from "@/theme/colors";

export function useAppPalette() {
  const { colorScheme } = useColorScheme();
  const systemScheme = useRnColorScheme();
  const appearanceMode = useAppearanceStore((state) => state.mode);

  const resolved: "light" | "dark" =
    appearanceMode === "light"
      ? "light"
      : appearanceMode === "dark"
        ? "dark"
        : colorScheme === "dark" || systemScheme === "dark"
          ? "dark"
          : "light";

  return {
    colorScheme: resolved,
    dark: resolved === "dark",
    palette: getPalette(resolved),
  };
}
