import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { getProjectApi } from "@/api/projects";
import { searchUsersApi, type SearchUser } from "@/api/users";
import {
  addWhiteboardMembersApi,
  createWhiteboardInviteApi,
  deleteWhiteboardMemberApi,
  updateWhiteboardMemberApi,
  type Whiteboard,
  type WhiteboardMember,
  type WhiteboardRole,
} from "@/api/whiteboards";
import { BottomDrawer } from "@/components/BottomDrawer";
import { getApiErrorMessage } from "@/api/apiClient";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";

const ROLES: WhiteboardRole[] = ["ADMIN", "MEMBER", "VIEWER"];

type WhiteboardMembersDrawerProps = {
  visible: boolean;
  board: Whiteboard;
  canManage: boolean;
  onClose: () => void;
  onChanged: (board: Whiteboard) => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WhiteboardMembersDrawer({
  visible,
  board,
  canManage,
  onClose,
  onChanged,
}: WhiteboardMembersDrawerProps) {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectUsers, setProjectUsers] = useState<SearchUser[] | null>(null);
  const [selected, setSelected] = useState<{ user: SearchUser; role: WhiteboardRole }[]>([]);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkRole, setLinkRole] = useState<WhiteboardRole>("VIEWER");
  const [linkUrl, setLinkUrl] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);

  useEffect(() => {
    if (!visible || !board.projectId) {
      setProjectUsers(null);
      return;
    }
    let cancelled = false;
    void getProjectApi(board.projectId)
      .then((project) => {
        if (cancelled) return;
        setProjectUsers(
          project.teamMembers
            .map((member) => ({
              id: member.userId ?? member.id ?? "",
              fullName: member.name ?? member.email ?? member.initials,
              email: member.email ?? "",
              avatarUrl: member.imageUrl ?? null,
            }))
            .filter((user) => user.id),
        );
      })
      .catch(() => {
        if (!cancelled) setProjectUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [board.projectId, visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!visible || trimmed.length < 2) {
      setResults([]);
      return;
    }
    if (projectUsers) {
      const needle = trimmed.toLowerCase();
      setResults(
        projectUsers.filter(
          (user) =>
            user.fullName.toLowerCase().includes(needle) ||
            user.email.toLowerCase().includes(needle),
        ),
      );
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void searchUsersApi(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [projectUsers, query, visible]);

  const existingIds = useMemo(
    () => new Set(board.members.map((member) => member.userId)),
    [board.members],
  );
  const selectedIds = new Set(selected.map((item) => item.user.id));
  const filtered = results.filter(
    (user) => !existingIds.has(user.id) && !selectedIds.has(user.id),
  );

  const invite = async () => {
    if (!selected.length || inviting) return;
    setInviting(true);
    try {
      const updated = await addWhiteboardMembersApi(
        board.id,
        selected.map((item) => ({ userId: item.user.id, role: item.role })),
      );
      setSelected([]);
      setQuery("");
      onChanged(updated);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not add collaborators",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setInviting(false);
    }
  };

  const createLink = async () => {
    if (creatingLink) return;
    setCreatingLink(true);
    try {
      const invite = await createWhiteboardInviteApi(board.id, linkRole);
      const origin = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "") ?? "";
      const url = origin
        ? `${origin}/whiteboard/join/${invite.token}`
        : Linking.createURL(`whiteboard/join/${invite.token}`);
      setLinkUrl(url);
      await Share.share({
        title: "Whiteboard invite",
        message: `Join "${board.title || "Untitled board"}" as ${linkRole.toLowerCase()}. This link works once.\n${url}`,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not create invite link",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setCreatingLink(false);
    }
  };

  const changeRole = async (member: WhiteboardMember, role: WhiteboardRole) => {
    if (busyId) return;
    setBusyId(member.userId);
    try {
      onChanged(await updateWhiteboardMemberApi(board.id, member.userId, role));
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not update role",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member: WhiteboardMember) => {
    if (busyId) return;
    setBusyId(member.userId);
    try {
      onChanged(await deleteWhiteboardMemberApi(board.id, member.userId));
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not remove collaborator",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomDrawer
      visible={visible}
      title="Collaborators"
      subtitle={
        board.projectId
          ? "People from this project. Admins can save as an image."
          : "Anyone can be added. Admins can save as an image."
      }
      onClose={onClose}
    >
      {canManage ? (
        <View className="mb-4 gap-3 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
          <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
            Add people
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={board.projectId ? "Search project members..." : "Search by name or email..."}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
          />
          {query.trim().length >= 2 ? (
            <View className="rounded-nova border border-glass bg-sidebar p-1.5 dark:border-dark-glass dark:bg-dark-sidebar">
              {loading ? (
                <Text className="px-3 py-2 text-sm text-muted dark:text-dark-muted">
                  Searching...
                </Text>
              ) : filtered.length === 0 ? (
                <Text className="px-3 py-2 text-sm text-muted dark:text-dark-muted">
                  No users found.
                </Text>
              ) : (
                filtered.slice(0, 5).map((user) => (
                  <Pressable
                    key={user.id}
                    onPress={() =>
                      setSelected((current) => [...current, { user, role: "MEMBER" }])
                    }
                    className="rounded-nova px-3 py-2"
                  >
                    <Text className="font-black text-primary dark:text-dark-primary">
                      {user.fullName}
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">{user.email}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
          {selected.map((item) => (
            <View
              key={item.user.id}
              className="rounded-nova border border-glass bg-glass-button p-3 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="font-black text-primary dark:text-dark-primary">
                    {item.user.fullName}
                  </Text>
                  <Text className="text-xs text-muted dark:text-dark-muted">{item.user.email}</Text>
                </View>
                <Pressable
                  onPress={() =>
                    setSelected((current) =>
                      current.filter((entry) => entry.user.id !== item.user.id),
                    )
                  }
                >
                  <Ionicons name="close-outline" size={18} color={palette.muted} />
                </Pressable>
              </View>
              <View className="mt-3 flex-row gap-2">
                {ROLES.map((role) => (
                  <Pressable
                    key={role}
                    onPress={() =>
                      setSelected((current) =>
                        current.map((entry) =>
                          entry.user.id === item.user.id ? { ...entry, role } : entry,
                        ),
                      )
                    }
                    className={`flex-1 rounded-full border px-2 py-1.5 ${
                      item.role === role
                        ? "border-accent bg-accent/15 dark:border-dark-accent"
                        : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
                    }`}
                  >
                    <Text className="text-center text-[10px] font-black text-primary dark:text-dark-primary">
                      {role}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Pressable
            disabled={inviting || selected.length === 0}
            onPress={() => void invite()}
            className="min-h-[46px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
          >
            <Text className="font-black text-white">
              {inviting ? "Adding..." : "Add selected"}
            </Text>
          </Pressable>
          <View className="mt-1 border-t border-glass pt-4 dark:border-dark-glass">
            <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
              One-time link
            </Text>
            <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
              Choose the role, then share a link that works only once.
            </Text>
            <View className="mt-3 flex-row gap-2">
              {ROLES.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setLinkRole(role)}
                  className={`flex-1 rounded-full border px-2 py-1.5 ${
                    linkRole === role
                      ? "border-accent bg-accent/15 dark:border-dark-accent"
                      : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
                  }`}
                >
                  <Text className="text-center text-[10px] font-black text-primary dark:text-dark-primary">
                    {role}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              disabled={creatingLink}
              onPress={() => void createLink()}
              className="mt-3 min-h-[46px] items-center justify-center rounded-nova border border-glass bg-glass-button disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Text className="font-black text-primary dark:text-dark-primary">
                {creatingLink ? "Creating..." : "Share link"}
              </Text>
            </Pressable>
            {linkUrl ? (
              <Text className="mt-2 text-xs text-muted dark:text-dark-muted" numberOfLines={2}>
                {linkUrl}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {board.members.map((member) => (
        <View
          key={member.userId}
          className="mb-2 flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-glass-button dark:bg-dark-glass-button">
            <Text className="font-black text-primary dark:text-dark-primary">
              {initials(member.fullName)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-black text-primary dark:text-dark-primary">{member.fullName}</Text>
            <Text className="text-xs text-muted dark:text-dark-muted">{member.email}</Text>
            {canManage ? (
              <View className="mt-2 flex-row gap-1">
                {ROLES.map((role) => (
                  <Pressable
                    key={role}
                    disabled={busyId === member.userId}
                    onPress={() => void changeRole(member, role)}
                    className={`rounded-full border px-2 py-1 ${
                      member.role === role
                        ? "border-accent bg-accent/15 dark:border-dark-accent"
                        : "border-glass dark:border-dark-glass"
                    }`}
                  >
                    <Text className="text-[9px] font-black text-primary dark:text-dark-primary">
                      {role}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text className="mt-1 text-[10px] font-black text-accent dark:text-dark-accent">
                {member.role}
              </Text>
            )}
          </View>
          {canManage ? (
            <Pressable
              disabled={busyId === member.userId}
              onPress={() => void removeMember(member)}
            >
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </BottomDrawer>
  );
}
