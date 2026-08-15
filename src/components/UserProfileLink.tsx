import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/useAuthStore";

export function openUserProfile(userId: string) {
  const currentUserId = useAuthStore.getState().user?.id;
  if (userId === currentUserId) {
    router.push("/(main)/profile");
    return;
  }
  router.push({
    pathname: "/(main)/user/[id]",
    params: { id: userId },
  });
}

export function UserProfileLink({
  userId,
  children,
  className,
}: {
  userId?: string | null;
  children: ReactNode;
  className?: string;
}) {
  if (!userId) return <>{children}</>;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openUserProfile(userId)}
      className={className}
    >
      {children}
    </Pressable>
  );
}
