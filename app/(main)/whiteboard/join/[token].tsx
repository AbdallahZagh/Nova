import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  acceptWhiteboardInviteApi,
  getWhiteboardInviteApi,
} from "@/api/whiteboards";
import { PageSkeleton } from "@/components/Skeleton";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";

export default function WhiteboardJoinScreen() {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [title, setTitle] = useState("Whiteboard");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getWhiteboardInviteApi(token)
      .then((invite) => {
        if (cancelled) return;
        setTitle(invite.title);
        setRole(invite.role.toLowerCase());
      })
      .catch((error) => {
        if (cancelled) return;
        showSnackbar({
          variant: "error",
          title: "Invite unavailable",
          message: getApiErrorMessage(error, "This link is invalid or already used."),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showSnackbar, token]);

  const join = async () => {
    if (!token || joining) return;
    setJoining(true);
    try {
      const board = await acceptWhiteboardInviteApi(token);
      router.replace(`/(main)/whiteboard/${board.id}` as Href);
    } catch (error) {
      setJoining(false);
      showSnackbar({
        variant: "error",
        title: "Could not join",
        message: getApiErrorMessage(error, "This link may already be used."),
      });
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 items-center justify-center gap-4 p-6" style={{ backgroundColor: palette.main }}>
      <Text className="text-center text-[28px] font-black text-primary dark:text-dark-primary">
        Join whiteboard
      </Text>
      <Text className="text-center text-sm text-muted dark:text-dark-muted">
        You were invited to{" "}
        <Text className="font-black text-primary dark:text-dark-primary">{title}</Text>
        {role ? ` as ${role}` : ""}. This link can only be used once.
      </Text>
      <Pressable
        disabled={joining || !token}
        onPress={() => void join()}
        className="min-h-[50px] min-w-[180px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
      >
        <Text className="font-black text-white">
          {joining ? "Joining..." : "Join board"}
        </Text>
      </Pressable>
    </View>
  );
}
