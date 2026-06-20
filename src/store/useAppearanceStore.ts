import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

export type AppearanceMode = "system" | "light" | "dark";

const APPEARANCE_KEY = "nova-mobile-appearance";

type AppearanceState = {
  mode: AppearanceMode;
  isHydrated: boolean;
  setMode: (mode: AppearanceMode) => Promise<void>;
  hydrate: () => Promise<void>;
};

async function readMode() {
  if (Platform.OS === "web") {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(APPEARANCE_KEY);
  }

  return SecureStore.getItemAsync(APPEARANCE_KEY);
}

async function persistMode(mode: AppearanceMode) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APPEARANCE_KEY, mode);
    }
    return;
  }

  await SecureStore.setItemAsync(APPEARANCE_KEY, mode);
}

function isAppearanceMode(value: string | null): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark";
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  mode: "system",
  isHydrated: false,

  setMode: async (mode) => {
    set({ mode });
    await persistMode(mode);
  },

  hydrate: async () => {
    try {
      const saved = await readMode();
      if (isAppearanceMode(saved)) set({ mode: saved });
    } finally {
      set({ isHydrated: true });
    }
  },
}));
