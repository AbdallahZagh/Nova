import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "nova-mobile-theme-preference";

type ThemeState = {
  isHydrated: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  hydrate: () => Promise<void>;
};

async function readPreference() {
  if (Platform.OS === "web") {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(THEME_KEY);
  }
  return SecureStore.getItemAsync(THEME_KEY);
}

async function writePreference(preference: ThemePreference) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, preference);
    }
    return;
  }
  await SecureStore.setItemAsync(THEME_KEY, preference);
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export const useThemeStore = create<ThemeState>((set) => ({
  isHydrated: false,
  preference: "system",

  setPreference: async (preference) => {
    set({ preference });
    await writePreference(preference);
  },

  hydrate: async () => {
    try {
      const stored = await readPreference();
      if (isThemePreference(stored)) {
        set({ preference: stored });
      }
    } finally {
      set({ isHydrated: true });
    }
  },
}));
