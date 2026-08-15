import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  formatActivityTime,
  getTaskApi,
  isoToDateInputValue,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  updateTaskApi,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { getProjectApi, getProjectMemberRole, type Project, type ProjectTeamMember } from "@/api/projects";
import {
  closeTaskCommentApi,
  createTaskCommentApi,
  listTaskCommentsApi,
  replyTaskCommentApi,
  type TaskComment,
} from "@/api/task-comments";
import { CalendarField } from "@/components/CalendarField";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import { MultiSelectField } from "@/components/MultiSelectField";
import { PageSkeleton } from "@/components/Skeleton";
import { SelectField } from "@/components/SelectField";
import { UserAvatar } from "@/components/UserAvatar";
import { UserProfileLink } from "@/components/UserProfileLink";
import { mentionUsersFromPeople } from "@/mentions";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STATUS_OPTIONS = TASK_COLUMNS.map((status) => ({
  value: status,
  label: status,
}));

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: priority,
}));

function memberId(member: ProjectTeamMember) {
  return member.userId ?? member.id ?? "";
}

function memberOptions(members: ProjectTeamMember[]) {
  return members
    .map((member) => ({
      value: memberId(member),
      label: member.name ?? member.email ?? member.initials,
      description: member.email,
    }))
    .filter((option) => option.value);
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  return (
    <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
      <View className="mb-4 flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name={icon} size={16} color={palette.accent} />
        </View>
        <Text className="flex-1 text-[16px] font-black text-primary dark:text-dark-primary">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export default function TaskDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
  }>();
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  const taskId = Array.isArray(id) ? id[0] : id;
  const parentProjectId = Array.isArray(projectId) ? projectId[0] : projectId;
  const role = project ? getProjectMemberRole(project, user?.id) : null;
  const readOnly = role === "VIEWER";
  const canAssign = role === "OWNER" || role === "ADMIN";
  const canAssignSubtasks = Boolean(role && role !== "VIEWER");
  const canAddComment = Boolean(role && role !== "VIEWER");
  const canModerateComments = role === "OWNER" || role === "ADMIN";
  const assignableMembers = useMemo(
    () =>
      (project?.teamMembers ?? []).filter(
        (member) => member.role !== "VIEWER" && memberId(member),
      ),
    [project?.teamMembers],
  );
  const subtaskAssignableMembers = useMemo(() => {
    if (canAssign) return assignableMembers;
    if (!user?.id) return [];
    return assignableMembers.filter((member) => memberId(member) === user.id);
  }, [assignableMembers, canAssign, user?.id]);
  const mentionUsers = useMemo(
    () =>
      mentionUsersFromPeople([
        ...(project?.owner
          ? [
              {
                id: project.owner.id,
                username: project.owner.username,
                fullName: project.owner.fullName,
              },
            ]
          : []),
        ...(project?.teamMembers ?? []).map((member) => ({
          id: member.id,
          userId: member.userId,
          username: member.username,
          fullName: member.name,
          name: member.name,
          email: member.email,
        })),
      ]),
    [project],
  );

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
      const commentRows = await listTaskCommentsApi(taskId).catch(() => [] as TaskComment[]);
      setComments(commentRows);
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

  const addComment = async () => {
    const content = commentContent.trim();
    if (!task || !content || !canAddComment || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const created = await createTaskCommentApi(task.id, content);
      setComments((current) => [created, ...current]);
      setCommentContent("");
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not post comment",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const submitReply = async (commentId: string) => {
    const content = replyContent.trim();
    if (!content || !canModerateComments || busyCommentId) return;
    setBusyCommentId(commentId);
    try {
      const updated = await replyTaskCommentApi(commentId, content);
      setComments((current) =>
        current.map((item) => (item.id === commentId ? updated : item)),
      );
      setReplyingId(null);
      setReplyContent("");
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not reply",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setBusyCommentId(null);
    }
  };

  const closeComment = async (commentId: string) => {
    if (!canModerateComments || busyCommentId) return;
    setBusyCommentId(commentId);
    try {
      const updated = await closeTaskCommentApi(commentId);
      setComments((current) =>
        current.map((item) => (item.id === commentId ? updated : item)),
      );
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not close comment",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setBusyCommentId(null);
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

  const doneCount = task.subtasks.filter((item) => item.done).length;
  const assigneeChoices = memberOptions(assignableMembers);
  const subtaskAssigneeChoices = memberOptions(subtaskAssignableMembers);
  const footerPad = Math.max(insets.bottom, 12) + 70;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName={`gap-4 p-5 ${readOnly ? "pb-32" : "pb-6"}`}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="chevron-back-outline" size={18} color={palette.accent} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-xs font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
              {project?.title ?? "Task"}
            </Text>
            {role ? (
              <Text className="mt-0.5 text-[11px] font-bold text-accent dark:text-dark-accent">
                {readOnly ? "View only" : role}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="mb-2 text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
            Title
          </Text>
          <TextInput
            value={task.title}
            onChangeText={(title) => updateTask({ title })}
            editable={!readOnly}
            placeholder="Task title"
            placeholderTextColor={palette.muted}
            className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-[15px] font-black text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
          />
          <Text className="mb-2 mt-4 text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
            Description
          </Text>
          <TextInput
            value={task.description}
            onChangeText={(description) => updateTask({ description })}
            editable={!readOnly}
            placeholder="Add a description..."
            placeholderTextColor={palette.muted}
            multiline
            textAlignVertical="top"
            className="min-h-[88px] rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-[15px] leading-6 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
          />
        </View>

        <Section title="Details" icon="options-outline">
          <SelectField
            label="Status"
            value={task.status}
            options={STATUS_OPTIONS}
            onChange={(status) => updateTask({ status: status as TaskStatus })}
            title="Status"
            disabled={readOnly}
          />
          <View className="mt-4">
            <SelectField
              label="Priority"
              value={task.priority}
              options={PRIORITY_OPTIONS}
              onChange={(priority) => updateTask({ priority: priority as TaskPriority })}
              title="Priority"
              disabled={readOnly}
            />
          </View>
          <View className="mt-4">
            <Text className="mb-2 text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
              Due date
            </Text>
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
          {canAssign ? (
            <View className="mt-4">
              <MultiSelectField
                label="Assigned to"
                value={task.assigneeIds ?? []}
                options={assigneeChoices}
                onChange={(assigneeIds) => updateTask({ assigneeIds })}
                placeholder="Select team members..."
                title="Assigned to"
                searchPlaceholder="Search people..."
                disabled={readOnly}
              />
            </View>
          ) : null}
        </Section>

        <Section
          title="Subtasks"
          icon="checkbox-outline"
          action={
            <View className="flex-row items-center gap-2">
              {task.subtasks.length > 0 ? (
                <Text className="text-xs font-black text-muted dark:text-dark-muted">
                  {doneCount}/{task.subtasks.length}
                </Text>
              ) : null}
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
                  className="h-8 w-8 items-center justify-center rounded-full bg-accent dark:bg-dark-accent"
                >
                  <Ionicons name="add-outline" size={18} color={palette.white} />
                </Pressable>
              ) : null}
            </View>
          }
        >
          {task.subtasks.length > 0 ? (
            <View className="mb-4 h-1.5 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
              <View
                className="h-full rounded-full bg-accent dark:bg-dark-accent"
                style={{
                  width: `${Math.round((doneCount / task.subtasks.length) * 100)}%`,
                }}
              />
            </View>
          ) : null}
          <View className="gap-3">
            {task.subtasks.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                No subtasks yet. Add a checklist item to break this down.
              </Text>
            ) : (
              task.subtasks.map((subtask, index) => (
                <View
                  key={subtask.id}
                  className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
                >
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
                      className={`h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50 ${
                        subtask.done
                          ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
                          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                      }`}
                    >
                      {subtask.done ? (
                        <Ionicons name="checkmark-outline" size={16} color={palette.white} />
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
                      className={`flex-1 text-[15px] font-bold ${
                        subtask.done
                          ? "text-muted line-through dark:text-dark-muted"
                          : "text-primary dark:text-dark-primary"
                      }`}
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
                        <Ionicons name="close-outline" size={16} color={palette.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {canAssignSubtasks ? (
                    <View className="mt-3">
                      <MultiSelectField
                        label="Assignees"
                        value={subtask.assigneeIds ?? []}
                        options={subtaskAssigneeChoices}
                        onChange={(assigneeIds) =>
                          updateTask({
                            subtasks: task.subtasks.map((item) =>
                              item.id === subtask.id ? { ...item, assigneeIds } : item,
                            ),
                          })
                        }
                        placeholder="Assign subtask..."
                        title="Subtask assignees"
                        searchPlaceholder="Search people..."
                        disabled={readOnly}
                      />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </Section>

        <Section
          title="Comments"
          icon="chatbubble-ellipses-outline"
          action={
            <Text className="text-xs font-black text-muted dark:text-dark-muted">
              {comments.length}
            </Text>
          }
        >
          {canAddComment ? (
            <View className="gap-3">
              <MentionComposer
                value={commentContent}
                onChange={setCommentContent}
                users={mentionUsers}
                placeholder="Add a comment. Use @ to mention someone."
                disabled={commentSubmitting}
              />
              <Pressable
                disabled={!commentContent.trim() || commentSubmitting}
                onPress={() => void addComment()}
                className="min-h-[46px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
              >
                <Text className="font-black text-white">
                  {commentSubmitting ? "Posting..." : "Add Comment"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View className={`${canAddComment ? "mt-4" : ""} gap-3`}>
            {comments.length === 0 ? (
              <Text className="text-sm text-muted dark:text-dark-muted">
                No comments yet.
              </Text>
            ) : (
              comments.map((comment) => {
                const isClosed = comment.status === "CLOSED";
                const isBusy = busyCommentId === comment.id;
                const canAct = canModerateComments && !isClosed;
                const isReplying = replyingId === comment.id;
                return (
                  <View
                    key={comment.id}
                    className="rounded-nova border border-glass bg-glass-card p-3.5 dark:border-dark-glass dark:bg-dark-glass-card"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1 flex-row items-start gap-2.5">
                        <UserAvatar
                          name={comment.createdBy?.fullName}
                          avatarUrl={comment.createdBy?.avatarUrl}
                          size="sm"
                        />
                        <View className="min-w-0 flex-1">
                        <UserProfileLink userId={comment.createdBy?.id ?? comment.createdById}>
                          <Text className="font-black text-primary dark:text-dark-primary">
                            {comment.createdBy?.fullName ?? "Project member"}
                          </Text>
                        </UserProfileLink>
                        <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                          {formatActivityTime(comment.createdAt) || "Recently"}
                        </Text>
                        </View>
                      </View>
                      <Text
                        className={`rounded-full border px-2 py-1 text-[10px] font-black ${
                          isClosed
                            ? "border-glass text-muted dark:border-dark-glass dark:text-dark-muted"
                            : "border-accent/40 text-accent dark:text-dark-accent"
                        }`}
                      >
                        {comment.status}
                      </Text>
                    </View>
                    <MentionText
                      content={comment.content}
                      users={mentionUsers}
                      className="mt-3 text-sm leading-5 text-primary dark:text-dark-primary"
                    />
                    {comment.replyContent ? (
                      <View className="mt-3 rounded-nova border border-accent/25 bg-accent/10 p-3">
                        <View className="flex-row flex-wrap items-center gap-1">
                          <Text className="text-[10px] font-black uppercase tracking-[1.2px] text-accent dark:text-dark-accent">
                            Reply ·
                          </Text>
                          <UserProfileLink userId={comment.repliedBy?.id}>
                            <Text className="text-[10px] font-black uppercase tracking-[1.2px] text-accent dark:text-dark-accent">
                              {comment.repliedBy?.fullName ?? "Admin"}
                            </Text>
                          </UserProfileLink>
                        </View>
                        <MentionText
                          content={comment.replyContent}
                          users={mentionUsers}
                          className="mt-1.5 text-sm leading-5 text-primary dark:text-dark-primary"
                        />
                      </View>
                    ) : null}
                    {isClosed && comment.closedAt ? (
                      <View className="mt-2 flex-row flex-wrap items-center gap-1">
                        <Text className="text-xs text-muted dark:text-dark-muted">
                          Closed by
                        </Text>
                        <UserProfileLink userId={comment.closedBy?.id}>
                          <Text className="text-xs text-muted dark:text-dark-muted">
                            {comment.closedBy?.fullName ?? "Admin"}
                          </Text>
                        </UserProfileLink>
                      </View>
                    ) : null}
                    {isReplying && canAct ? (
                      <View className="mt-3 gap-2">
                        <MentionComposer
                          value={replyContent}
                          onChange={setReplyContent}
                          users={mentionUsers}
                          placeholder="Write a reply. Use @ to mention someone."
                          disabled={isBusy}
                          minHeight={72}
                        />
                        <View className="flex-row gap-2">
                          <Pressable
                            disabled={isBusy}
                            onPress={() => {
                              setReplyingId(null);
                              setReplyContent("");
                            }}
                            className="min-h-[44px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                          >
                            <Text className="font-black text-primary dark:text-dark-primary">
                              Cancel
                            </Text>
                          </Pressable>
                          <Pressable
                            disabled={!replyContent.trim() || isBusy}
                            onPress={() => void submitReply(comment.id)}
                            className="min-h-[44px] flex-1 items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
                          >
                            <Text className="font-black text-white">
                              {isBusy ? "Replying..." : "Send Reply"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : canAct ? (
                      <View className="mt-3 flex-row gap-2">
                        <Pressable
                          disabled={isBusy}
                          onPress={() => {
                            setReplyingId(comment.id);
                            setReplyContent(comment.replyContent ?? "");
                          }}
                          className="min-h-[40px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                        >
                          <Text className="text-xs font-black text-primary dark:text-dark-primary">
                            Reply
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={isBusy}
                          onPress={() => void closeComment(comment.id)}
                          className="min-h-[40px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                        >
                          <Text className="text-xs font-black text-primary dark:text-dark-primary">
                            Close
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </Section>

        <Section title="Activity" icon="time-outline">
          {task.activity.length === 0 ? (
            <Text className="text-sm text-muted dark:text-dark-muted">
              No activity yet.
            </Text>
          ) : (
            <View>
              {task.activity.slice(0, 10).map((item, index, list) => (
                <View key={item.id} className="flex-row gap-3">
                  <View className="items-center">
                    <View className="mt-1 h-2.5 w-2.5 rounded-full bg-accent dark:bg-dark-accent" />
                    {index < list.length - 1 ? (
                      <View className="w-px flex-1 bg-glass dark:bg-dark-glass" />
                    ) : null}
                  </View>
                  <View className="flex-1 pb-4">
                    <Text className="font-bold leading-5 text-primary dark:text-dark-primary">
                      {item.message}
                    </Text>
                    <Text className="mt-1 text-xs text-muted dark:text-dark-muted">
                      {item.time}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      {!readOnly ? (
        <View
          className="flex-row items-center gap-3 border-t border-glass bg-sidebar px-5 pt-3 dark:border-dark-glass dark:bg-dark-sidebar"
          style={{ paddingBottom: footerPad }}
        >
          <Pressable
            onPress={() => setConfirmDelete(true)}
            className="h-12 w-12 items-center justify-center rounded-nova border border-danger/40 bg-danger/10 dark:border-dark-danger/40 dark:bg-dark-danger/10"
          >
            <Ionicons name="trash-outline" size={18} color={palette.danger} />
          </Pressable>
          <Pressable
            disabled={saving}
            onPress={() => void save()}
            className="h-12 min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
          >
            {saving ? (
              <ActivityIndicator color={palette.white} size="small" />
            ) : (
              <Ionicons name="checkmark-outline" size={18} color={palette.white} />
            )}
            <Text className="font-black text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
