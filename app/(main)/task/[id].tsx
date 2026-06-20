import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  dateInputToIso,
  deleteTaskApi,
  getTaskApi,
  isoToDateInputValue,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  updateTaskApi,
  type Task,
} from "@/api/tasks";
import { getProjectApi, getProjectMemberRole, type Project } from "@/api/projects";
import { CalendarField } from "@/components/CalendarField";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
      {children}
    </Text>
  );
}

function Chip<T extends string>({
  label,
  active,
  disabled,
  onPress,
}: {
  label: T;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full border px-3 py-2 disabled:opacity-50 ${
        active
          ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
      }`}
    >
      <Text className="text-xs font-black text-primary dark:text-dark-primary">
        {label}
      </Text>
    </Pressable>
  );
}

export default function TaskDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
  }>();
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const taskId = Array.isArray(id) ? id[0] : id;
  const parentProjectId = Array.isArray(projectId) ? projectId[0] : projectId;
  const role = project ? getProjectMemberRole(project, user?.id) : null;
  const readOnly = role === "VIEWER";

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const data = await getTaskApi(taskId);
      setTask(data);
      const relatedProjectId = parentProjectId ?? data.projectId;
      if (relatedProjectId) {
        const projectData = await getProjectApi(relatedProjectId);
        setProject(projectData);
      }
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load task",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [parentProjectId, showSnackbar, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const updateTask = (patch: Partial<Task>) => {
    if (readOnly) return;
    setTask((current) => (current ? { ...current, ...patch } : current));
  };

  const save = async () => {
    if (!task || readOnly) return;
    setSaving(true);
    try {
      const saved = await updateTaskApi(task);
      setTask(saved);
      showSnackbar({ variant: "success", title: "Task saved" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Save failed",
        message: getApiErrorMessage(error, "Could not save task."),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      await deleteTaskApi(task.id);
      showSnackbar({ variant: "success", title: "Task deleted" });
      setConfirmDelete(false);
      if (parentProjectId) {
        router.replace({ pathname: "/project/[id]", params: { id: parentProjectId } });
      } else {
        router.back();
      }
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message: getApiErrorMessage(error, "Could not delete task."),
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton />;

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center bg-main p-6 dark:bg-dark-main">
        <Text className="text-xl font-black text-primary dark:text-dark-primary">
          Task not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-nova bg-accent px-4 py-3 dark:bg-dark-accent"
        >
          <Text className="font-black text-white">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="gap-5 p-5 pb-32"
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Pressable onPress={() => router.back()} className="mb-4 flex-row items-center gap-2">
            <Ionicons name="chevron-back-outline" size={18} color={palette.accent} />
            <Text className="font-black text-accent dark:text-dark-accent">
              Back
            </Text>
          </Pressable>
          <Text className="text-[28px] font-black text-primary dark:text-dark-primary">
            Task Details
          </Text>
          <Text className="mt-2 text-sm text-muted dark:text-dark-muted">
            {readOnly
              ? "You can view this task, but your project role cannot edit it."
              : "Full task editing lives here so long tasks are easier on mobile."}
          </Text>
          {role ? (
            <Text className="mt-3 self-start rounded-full border border-accent/40 px-3 py-1 text-xs font-black text-accent dark:text-dark-accent">
              {role}
            </Text>
          ) : null}
        </View>

        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <View>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              value={task.title}
              onChangeText={(title) => updateTask({ title })}
              editable={!readOnly}
              placeholder="Task title"
              placeholderTextColor={palette.muted}
              className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
            />
          </View>

          <View className="mt-4">
            <FieldLabel>Description</FieldLabel>
            <TextInput
              value={task.description}
              onChangeText={(description) => updateTask({ description })}
              editable={!readOnly}
              placeholder="Task description"
              placeholderTextColor={palette.muted}
              multiline
              textAlignVertical="top"
              className="min-h-[120px] rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
            />
          </View>

          <View className="mt-4">
            <FieldLabel>Status</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {TASK_COLUMNS.map((status) => (
                <Chip
                  key={status}
                  label={status}
                  active={task.status === status}
                  disabled={readOnly}
                  onPress={() => updateTask({ status })}
                />
              ))}
            </View>
          </View>

          <View className="mt-4">
            <FieldLabel>Priority</FieldLabel>
            <View className="flex-row gap-2">
              {TASK_PRIORITIES.map((priority) => (
                <Pressable
                  key={priority}
                  disabled={readOnly}
                  onPress={() => updateTask({ priority })}
                  className={`flex-1 rounded-nova border px-3 py-2 disabled:opacity-50 ${
                    task.priority === priority
                      ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                      : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                  }`}
                >
                  <Text className="text-center text-xs font-black text-primary dark:text-dark-primary">
                    {priority}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="mt-4">
            <FieldLabel>Due Date</FieldLabel>
            <CalendarField
              value={isoToDateInputValue(task.dueDateIso)}
              onChange={(value) =>
                updateTask({
                  dueDateIso: dateInputToIso(value),
                  dueDate: value || "TBD",
                })
              }
              disabled={readOnly}
              placeholder="Select due date"
            />
          </View>
        </View>

        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
              Subtasks
            </Text>
            {!readOnly ? (
              <Pressable
                onPress={() =>
                  updateTask({
                    subtasks: [
                      ...task.subtasks,
                      {
                        id: `new-${Date.now()}`,
                        label: "",
                        done: false,
                        assignees: [],
                        assigneeIds: [],
                      },
                    ],
                  })
                }
                className="h-9 w-9 items-center justify-center rounded-full bg-accent dark:bg-dark-accent"
              >
                <Ionicons name="add-outline" size={20} color={palette.white} />
              </Pressable>
            ) : null}
          </View>

          <View className="gap-3">
            {task.subtasks.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                No subtasks yet.
              </Text>
            ) : (
              task.subtasks.map((subtask, index) => (
                <View key={subtask.id} className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      disabled={readOnly}
                      onPress={() =>
                        updateTask({
                          subtasks: task.subtasks.map((item) =>
                            item.id === subtask.id
                              ? { ...item, done: !item.done }
                              : item,
                          ),
                        })
                      }
                      className={`h-8 w-8 items-center justify-center rounded-nova border disabled:opacity-50 ${
                        subtask.done
                          ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
                          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                      }`}
                    >
                      {subtask.done ? (
                        <Ionicons name="checkmark-outline" size={18} color={palette.white} />
                      ) : null}
                    </Pressable>
                    <TextInput
                      value={subtask.label}
                      onChangeText={(label) =>
                        updateTask({
                          subtasks: task.subtasks.map((item) =>
                            item.id === subtask.id ? { ...item, label } : item,
                          ),
                        })
                      }
                      editable={!readOnly}
                      placeholder={`Subtask ${index + 1}`}
                      placeholderTextColor={palette.muted}
                      className="flex-1 text-primary dark:text-dark-primary"
                    />
                    {!readOnly ? (
                      <Pressable
                        onPress={() =>
                          updateTask({
                            subtasks: task.subtasks.filter((item) => item.id !== subtask.id),
                          })
                        }
                        className="h-8 w-8 items-center justify-center rounded-full bg-glass-button dark:bg-dark-glass-button"
                      >
                        <Ionicons name="close-outline" size={18} color={palette.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
            Activity
          </Text>
          <View className="mt-4 gap-3">
            {task.activity.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                No activity yet.
              </Text>
            ) : (
              task.activity.slice(0, 10).map((item) => (
                <View key={item.id} className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
                  <Text className="font-bold text-primary dark:text-dark-primary">
                    {item.message}
                  </Text>
                  <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
                    {item.time}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {!readOnly ? (
          <View className="flex-row gap-3">
            <Pressable
              disabled={saving}
              onPress={save}
              className="min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
            >
              {saving ? <ActivityIndicator color={palette.white} /> : null}
              <Text className="font-black text-white">
                {saving ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmDelete(true)}
              className="min-h-[52px] w-[58px] items-center justify-center rounded-nova border border-danger/40 bg-danger/10 dark:border-dark-danger/40 dark:bg-dark-danger/10"
            >
              <Ionicons name="trash-outline" size={21} color={palette.danger} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmationPopup
        visible={confirmDelete}
        title="Delete task?"
        message="This permanently removes the task and its subtasks."
        confirmLabel={deleting ? "Deleting..." : "Delete task"}
        variant="danger"
        icon="trash-outline"
        loading={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        onConfirm={remove}
      />
    </View>
  );
}
