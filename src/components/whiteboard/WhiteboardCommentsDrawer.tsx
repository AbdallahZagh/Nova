import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  createWhiteboardCommentApi,
  deleteWhiteboardCommentApi,
  listWhiteboardCommentsApi,
  type Whiteboard,
  type WhiteboardComment,
} from "@/api/whiteboards";
import { BottomDrawer } from "@/components/BottomDrawer";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import { mentionUsersFromPeople } from "@/mentions";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";

export function WhiteboardCommentsDrawer({
  board,
  pageId,
  visible,
  currentUserId,
  onClose,
}: {
  board: Whiteboard;
  pageId?: string;
  visible: boolean;
  currentUserId?: string;
  onClose: () => void;
}) {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [items, setItems] = useState<WhiteboardComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canComment = board.myRole === "ADMIN" || board.myRole === "MEMBER";
  const users = useMemo(
    () =>
      mentionUsersFromPeople(
        board.members.map((member) => ({
          userId: member.userId,
          username: member.username,
          fullName: member.fullName,
        })),
      ),
    [board.members],
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    void listWhiteboardCommentsApi(board.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        showSnackbar({
          variant: "error",
          title: "Could not load comments",
          message: getApiErrorMessage(error, "Please try again."),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board.id, showSnackbar, visible]);

  const submit = async () => {
    const next = content.trim();
    if (!next || submitting) return;
    setSubmitting(true);
    try {
      const created = await createWhiteboardCommentApi(board.id, {
        content: next,
        pageId,
      });
      setItems((current) => [created, ...current]);
      setContent("");
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not post comment",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteWhiteboardCommentApi(board.id, commentId);
      setItems((current) => current.filter((item) => item.id !== commentId));
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not delete comment",
        message: getApiErrorMessage(error, "Please try again."),
      });
    }
  };

  return (
    <BottomDrawer
      visible={visible}
      title="Comments"
      subtitle={
        canComment
          ? "Use @ to mention someone on this board."
          : "You can read comments. Only members can post."
      }
      onClose={onClose}
      footer={
        canComment ? (
          <View className="gap-3">
            <MentionComposer
              value={content}
              onChange={setContent}
              users={users}
              placeholder="Write a comment. Use @ to mention someone."
              disabled={submitting}
            />
            <Pressable
              disabled={!content.trim() || submitting}
              onPress={() => void submit()}
              className="min-h-[48px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
            >
              <Text className="font-black text-white">
                {submitting ? "Posting..." : "Comment"}
              </Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      {loading ? (
        <Text className="py-8 text-center text-sm text-muted dark:text-dark-muted">
          Loading comments...
        </Text>
      ) : items.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted dark:text-dark-muted">
          No comments yet.
        </Text>
      ) : (
        items.map((item) => {
          const canDelete =
            item.createdById === currentUserId || board.myRole === "ADMIN";
          return (
            <View
              key={item.id}
              className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-black text-primary dark:text-dark-primary">
                    {item.createdBy?.fullName || "Someone"}
                  </Text>
                  <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                {canDelete ? (
                  <Pressable onPress={() => void remove(item.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                ) : null}
              </View>
              <MentionText
                content={item.content}
                className="mt-2 text-sm leading-5 text-primary dark:text-dark-primary"
              />
            </View>
          );
        })
      )}
    </BottomDrawer>
  );
}
