import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import { listProjectsApi, type Project } from "@/api/projects";
import {
  createWhiteboardApi,
  deleteWhiteboardApi,
  duplicateWhiteboardApi,
  listProjectWhiteboardsApi,
  listWhiteboardsApi,
  type Whiteboard,
} from "@/api/whiteboards";
import { BottomDrawer } from "@/components/BottomDrawer";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";

export default function WhiteboardListScreen() {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const isDemo = Boolean(useAuthStore((state) => state.user?.isDemo));
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectFilter = typeof params.projectId === "string" ? params.projectId : "";

  const [boards, setBoards] = useState<Whiteboard[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projectFilter);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.title])),
    [projects],
  );

  const load = useCallback(async () => {
    const [boardRows, projectRows] = await Promise.all([
      projectFilter ? listProjectWhiteboardsApi(projectFilter) : listWhiteboardsApi(),
      listProjectsApi().catch(() => [] as Project[]),
    ]);
    setBoards(boardRows);
    setProjects(projectRows);
  }, [projectFilter]);

  useEffect(() => {
    setProjectId(projectFilter);
  }, [projectFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((error) => {
        if (cancelled) return;
        showSnackbar({
          variant: "error",
          title: "Could not load whiteboards",
          message: getApiErrorMessage(error, "Please try again."),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, showSnackbar]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const board = await createWhiteboardApi({
        title: title.trim() || undefined,
        projectId: projectId || undefined,
      });
      setCreateOpen(false);
      setTitle("");
      router.push(`/(main)/whiteboard/${board.id}` as Href);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Create failed",
        message: getApiErrorMessage(error, "Could not create the board."),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWhiteboardApi(deleteTarget.id);
      setBoards((current) => current.filter((board) => board.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message: getApiErrorMessage(error, "Could not delete the board."),
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (board: Whiteboard) => {
    if (duplicatingId) return;
    setDuplicatingId(board.id);
    try {
      const copy = await duplicateWhiteboardApi(board.id);
      router.push(`/(main)/whiteboard/${copy.id}` as Href);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Duplicate failed",
        message: getApiErrorMessage(error, "Could not copy the board."),
      });
      setDuplicatingId(null);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.main }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
        contentContainerClassName="gap-5 p-5 pb-32"
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[28px] font-black text-primary dark:text-dark-primary">
              Whiteboards
            </Text>
            <Text className="mt-2 text-sm text-muted dark:text-dark-muted">
              {projectFilter
                ? `Boards for ${projectNameById[projectFilter] ?? "this project"}.`
                : "Draw together. Changes sync live."}
            </Text>
          </View>
          {isDemo ? null : (
          <Pressable
            onPress={() => setCreateOpen(true)}
            className="min-h-[44px] flex-row items-center gap-1 rounded-nova bg-accent px-3 dark:bg-dark-accent"
          >
            <Ionicons name="add" size={18} color={palette.white} />
            <Text className="font-black text-white">New</Text>
          </Pressable>
          )}
        </View>

        {boards.length === 0 ? (
          <View className="rounded-nova-lg border border-glass bg-glass-card p-8 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-center text-sm font-bold text-muted dark:text-dark-muted">
              No whiteboards yet.
            </Text>
          </View>
        ) : (
          boards.map((board) => (
            <View
              key={board.id}
              className="overflow-hidden rounded-nova-lg border border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Pressable
                onPress={() => router.push(`/(main)/whiteboard/${board.id}` as Href)}
              >
                <View className="h-32 items-center justify-center bg-main dark:bg-dark-main">
                  {board.snapshot?.imageUrl ? (
                    <Image
                      key={board.snapshot.imageUrl}
                      source={{ uri: board.snapshot.imageUrl }}
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons
                      name="brush-outline"
                      size={28}
                      color={palette.subtle}
                    />
                  )}
                </View>
              </Pressable>
              <View className="flex-row items-center justify-between gap-3 p-4">
                <Pressable
                  onPress={() => router.push(`/(main)/whiteboard/${board.id}` as Href)}
                  className="flex-1"
                >
                  <Text className="text-base font-black text-primary dark:text-dark-primary">
                    {board.title || "Untitled board"}
                  </Text>
                  <Text className="mt-1 text-xs font-bold text-muted dark:text-dark-muted">
                    {board.projectId
                      ? projectNameById[board.projectId] ?? "Project board"
                      : "Personal"}
                    {board.pages?.length > 1 ? ` · ${board.pages.length} pages` : ""}
                    {board.lastEditedBy?.fullName
                      ? ` · ${board.lastEditedBy.fullName}`
                      : ""}
                    {` · ${new Date(board.lastEditedAt || board.updatedAt).toLocaleDateString()}`}
                  </Text>
                </Pressable>
                {isDemo ? null : (
                <View className="flex-row items-center">
                  <Pressable
                    disabled={duplicatingId === board.id}
                    onPress={() => void handleDuplicate(board)}
                    hitSlop={8}
                    className="p-2"
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={duplicatingId === board.id ? palette.subtle : palette.muted}
                    />
                  </Pressable>
                  {board.myRole === "ADMIN" ? (
                <Pressable
                  onPress={() => setDeleteTarget(board)}
                  hitSlop={8}
                  className="p-2"
                >
                  <Ionicons name="trash-outline" size={18} color={palette.danger} />
                </Pressable>
                  ) : null}
                </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <BottomDrawer
        visible={createOpen}
        title="New whiteboard"
        onClose={() => !creating && setCreateOpen(false)}
        footer={
          <Pressable
            disabled={creating}
            onPress={handleCreate}
            className="min-h-[50px] items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
          >
            <Text className="font-black text-white">
              {creating ? "Creating…" : "Create board"}
            </Text>
          </Pressable>
        }
      >
        <View className="gap-4">
          <View>
            <Text className="mb-2 text-xs font-extrabold uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Sprint planning"
              placeholderTextColor={palette.muted}
              className="min-h-[50px] rounded-nova border border-glass bg-glass-button px-3.5 text-[15px] text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
            />
          </View>
          <View>
            <Text className="mb-2 text-xs font-extrabold uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
              Project
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <Pressable
                onPress={() => setProjectId("")}
                className={`rounded-full border px-3 py-2 ${
                  !projectId
                    ? "border-accent bg-accent/15 dark:border-dark-accent"
                    : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                }`}
              >
                <Text className="text-xs font-black text-primary dark:text-dark-primary">
                  Personal
                </Text>
              </Pressable>
              {projects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => setProjectId(project.id)}
                  className={`rounded-full border px-3 py-2 ${
                    projectId === project.id
                      ? "border-accent bg-accent/15 dark:border-dark-accent"
                      : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                  }`}
                >
                  <Text className="text-xs font-black text-primary dark:text-dark-primary">
                    {project.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </BottomDrawer>

      <ConfirmationPopup
        visible={Boolean(deleteTarget)}
        title="Delete whiteboard?"
        message="This permanently removes the board, strokes, and snapshot."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </View>
  );
}
