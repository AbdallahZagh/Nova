import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import type { ApiUser, LoginResponse } from "@/api/types";

const SESSION_KEY = "nova-mobile-session";

type PersistedSession = {
  accessToken: string;
  refreshToken: string | null;
  user: ApiUser | null;
  deviceToken: string | null;
};

type AuthState = PersistedSession & {
  isHydrated: boolean;
  setSession: (session: LoginResponse) => Promise<void>;
  setUser: (user: ApiUser | null) => Promise<void>;
  clearSession: () => Promise<void>;
  setDeviceToken: (deviceToken: string | null) => Promise<void>;
  hydrate: () => Promise<void>;
};

async function readSession() {
  if (Platform.OS === "web") {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SESSION_KEY);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function removeSession() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function persistSession(session: PersistedSession | null) {
  if (!session) {
    await removeSession();
    return;
  }

  const serialized = JSON.stringify(session);
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, serialized);
    }
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, serialized);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: "",
  refreshToken: null,
  user: null,
  deviceToken: null,
  isHydrated: false,

  setSession: async (session) => {
    const next: PersistedSession = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      user: session.user,
      deviceToken: get().deviceToken,
    };
    set(next);
    await persistSession(next);
  },

  setUser: async (user) => {
    const state = get();
    set({ user });
    if (state.accessToken) {
      await persistSession({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user,
        deviceToken: state.deviceToken,
      });
    }
  },

  clearSession: async () => {
    set({
      accessToken: "",
      refreshToken: null,
      user: null,
      deviceToken: null,
    });
    await persistSession(null);
  },

  setDeviceToken: async (deviceToken) => {
    set({ deviceToken });
    const state = get();
    if (state.accessToken && state.user) {
      await persistSession({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        deviceToken,
      });
    }
  },

  hydrate: async () => {
    try {
      const raw = await readSession();
      if (raw) {
        const session = JSON.parse(raw) as PersistedSession;
        set(session);
      }
    } catch {
      await removeSession();
    } finally {
      set({ isHydrated: true });
    }
  },
}));

export function hasAuthenticatedSession() {
  const state = useAuthStore.getState();
  return Boolean(state.accessToken && state.user);
}
