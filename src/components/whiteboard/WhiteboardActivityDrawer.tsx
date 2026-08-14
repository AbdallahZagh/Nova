import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  listWhiteboardActivityApi,
  type WhiteboardActivity,
} from "@/api/whiteboards";
import { BottomDrawer } from "@/components/BottomDrawer";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { whiteboardActivityMessage } from "@/whiteboard/activity";

export function WhiteboardActivityDrawer({
  boardId,
  visible,
  onClose,
}: {
  boardId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [items, setItems] = useState<WhiteboardActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    void listWhiteboardActivityApi(boardId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((error) => {
        if (cancelled) return;
        showSnackbar({
          variant: "error",
          title: "Could not load history",
          message: getApiErrorMessage(error, "Please try again."),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, showSnackbar, visible]);

  return (
    <BottomDrawer
      visible={visible}
      title="Board history"
      subtitle="Created, people, pages, comments, exports, and drawing."
      onClose={onClose}
    >
      {loading ? (
        <Text className="py-8 text-center text-sm text-muted dark:text-dark-muted">
          Loading history...
        </Text>
      ) : items.length === 0 ? (
        <Text className="py-8 text-center text-sm text-muted dark:text-dark-muted">
          No activity yet.
        </Text>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
          >
            <Text className="font-bold text-primary dark:text-dark-primary">
              {whiteboardActivityMessage(item)}
            </Text>
            <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </View>
        ))
      )}
    </BottomDrawer>
  );
}
