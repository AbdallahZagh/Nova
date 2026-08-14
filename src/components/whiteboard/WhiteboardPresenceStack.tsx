import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  groupOnlinePresence,
  presenceDeviceLabel,
  type PresencePlatform,
} from "@/api/whiteboards";
import type { WhiteboardPresence } from "@/hooks/useWhiteboardSync";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type WhiteboardPresenceStackProps = {
  people: WhiteboardPresence[];
  muted: string;
};

export function WhiteboardPresenceStack({
  people,
  muted,
}: WhiteboardPresenceStackProps) {
  const [open, setOpen] = useState(false);
  const online = groupOnlinePresence(people);
  const visible = online.slice(0, 4);
  const extra = Math.max(0, online.length - visible.length);

  if (online.length === 0) return null;

  return (
    <>
      <Pressable
        accessibilityLabel="Who is on this board"
        onPress={() => setOpen(true)}
        className="flex-row items-center"
      >
        {visible.map((peer, index) => (
          <View
            key={peer.userId}
            className="size-7 items-center justify-center rounded-full border"
            style={{
              marginLeft: index === 0 ? 0 : -6,
              zIndex: visible.length - index,
              backgroundColor: peer.color,
              borderColor: peer.drawing ? "#e66a17" : "rgba(255,255,255,0.35)",
            }}
          >
            <Text className="text-[9px] font-black text-white">{initials(peer.name)}</Text>
            <View className="absolute -bottom-0.5 -right-0.5 flex-row">
              {peer.platforms.map((platform) => (
                <View
                  key={platform}
                  className="size-3 items-center justify-center rounded-full bg-sidebar dark:bg-dark-sidebar"
                >
                  <Ionicons
                    name={
                      platform === "ios" || platform === "android"
                        ? "phone-portrait-outline"
                        : "desktop-outline"
                    }
                    size={7}
                    color={muted}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        {extra > 0 ? (
          <View
            className="size-7 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            style={{ marginLeft: -6 }}
          >
            <Text className="text-[9px] font-black text-muted dark:text-dark-muted">
              +{extra}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/55" onPress={() => setOpen(false)} />
          <View className="rounded-t-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
            <Text className="mb-3 text-[16px] font-black text-primary dark:text-dark-primary">
              On this board
            </Text>
            {online.map((peer) => (
              <View key={peer.userId} className="mb-2 flex-row items-center gap-3">
                <View
                  className="size-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: peer.color }}
                >
                  <Text className="text-[11px] font-black text-white">
                    {initials(peer.name)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-primary dark:text-dark-primary">
                    {peer.isSelf ? `${peer.name} (you)` : peer.name}
                  </Text>
                  <View className="mt-0.5 flex-row flex-wrap items-center gap-2">
                    {peer.platforms.map((platform) => {
                      const phone =
                        platform === "ios" ||
                        (platform as PresencePlatform) === "android";
                      return (
                        <View key={platform} className="flex-row items-center gap-1">
                          <Ionicons
                            name={phone ? "phone-portrait-outline" : "desktop-outline"}
                            size={12}
                            color={muted}
                          />
                          <Text className="text-[12px] font-bold text-muted dark:text-dark-muted">
                            {presenceDeviceLabel(platform)}
                          </Text>
                        </View>
                      );
                    })}
                    {peer.drawing ? (
                      <Text className="text-[12px] font-bold text-muted dark:text-dark-muted">
                        · drawing
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
            <Pressable
              onPress={() => setOpen(false)}
              className="mt-2 min-h-[44px] items-center justify-center"
            >
              <Text className="text-[14px] font-extrabold text-accent dark:text-dark-accent">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
