"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/client";
import { getMeApi, updateMeApi } from "@/lib/api/users";
import {
  apiUserToProfile,
  profileToUpdatePayload,
} from "@/lib/api/user-mapper";
import {
  clearAccessToken,
  getAccessToken,
} from "@/lib/api/client";
import type { ApiUser } from "@/lib/api/types";
import type { ActivityMap } from "@/lib/api/dashboard";

export type UserProfileProject = {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  role: string;
  totalTasksCount: number;
  userTasksCount: number;
  completedUserTasksCount: number;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  bio: string;
  avatarUrl: string | null;
  isDemo: boolean;
  accountRole: "USER" | "SUPER_ADMIN";
  projectCount: number;
  taskCount: number;
  activity: ActivityMap;
  projects: UserProfileProject[];
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type UserContextValue = {
  profile: UserProfile | null;
  initials: string;
  loading: boolean;
  setProfileFromApi: (user: ApiUser) => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    updates: Partial<
      Pick<UserProfile, "name" | "username" | "role" | "bio" | "avatarUrl">
    >,
  ) => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const setProfileFromApi = useCallback((user: ApiUser) => {
    setProfile(apiUserToProfile(user));
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setProfile(null);
      return;
    }
    const user = await getMeApi();
    setProfile(apiUserToProfile(user));
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    refreshProfile()
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearAccessToken();
        }
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [refreshProfile]);

  const updateProfile = useCallback(
    async (
      updates: Partial<
        Pick<UserProfile, "name" | "username" | "role" | "bio" | "avatarUrl">
      >,
    ) => {
      const current = profile;
      if (!current) throw new Error("No profile loaded");

      const merged = { ...current, ...updates };
      const user = await updateMeApi(profileToUpdatePayload(merged));
      setProfile(apiUserToProfile(user));
    },
    [profile],
  );

  const initials = useMemo(
    () => (profile?.name ? getInitials(profile.name) : "—"),
    [profile?.name],
  );

  const value = useMemo(
    () => ({
      profile,
      initials,
      loading,
      setProfileFromApi,
      refreshProfile,
      updateProfile,
    }),
    [profile, initials, loading, setProfileFromApi, refreshProfile, updateProfile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
