import { useCallback, useEffect, useMemo, useState } from "react";
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
  addProjectMembersApi,
  type EditableProjectMemberRole,
  getProjectApi,
  getProjectMemberRole,
  projectStatusLabel,
  type Project,
} from "@/api/projects";
import { searchUsersApi, type SearchUser } from "@/api/users";
import {
  createProjectSuggestionApi,
  listProjectSuggestionsApi,
type ProjectSuggestion,
} from "@/api/projectSuggestions";
import {
  createTaskApi,
  deleteTaskApi,
  listTasksByProjectApi,
  sortTasksInStatusColumn,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { BottomDrawer } from "@/components/BottomDrawer";
import { CalendarField } from "@/components/CalendarField";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

const statusStyle: Record<TaskStatus, string> = {
  "To Do": "border-glass text-muted dark:border-dark-glass dark:text-dark-muted",
  "In Progress": "border-warning/50 text-warning dark:border-dark-warning/50 dark:text-dark-warning",
  "In Review": "border-accent/50 text-accent dark:border-dark-accent/50 dark:text-dark-accent",
  Completed: "border-success/50 text-success dark:border-dark-success/50 dark:text-dark-success",
};

const priorityStyle: Record<TaskPriority, string> = {
  High: "bg-danger/10 text-danger dark:bg-dark-danger/10 dark:text-dark-danger",
  Medium: "bg-warning/10 text-warning dark:bg-dark-warning/10 dark:text-dark-warning",
  Low: "bg-success/10 text-success dark:bg-dark-success/10 dark:text-dark-success",
};

function canEditTasks(role: string | null) {
  return Boolean(role && role !== "VIEWER");
}

function canAssignTasks(role: string | null) {
  return role === "OWNER" || role === "ADMIN";
}

function canManageTeam(role: string | null) {
  return role === "OWNER" || role === "ADMIN";
}

type SelectedInviteMember = {
  user: SearchUser;
  role: EditableProjectMemberRole;
};

type CreateSubtaskDraft = {
  id: string;
  label: string;
  done: boolean;
};

const inviteRoles: EditableProjectMemberRole[] = ["ADMIN", "MEMBER", "VIEWER"];

function TaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (task: Task) => void;
}) {
  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const total = task.subtasks.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(task)}
      className="rounded-nova-xl border border-glass bg-sidebar p-4 active:opacity-80 dark:border-dark-glass dark:bg-dark-sidebar"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[16px] font-black text-primary dark:text-dark-primary">
            {task.title}
          </Text>
          {task.description ? (
            <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
              {task.description}
            </Text>
          ) : null}
        </View>
        <Text
          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${priorityStyle[task.priority]}`}
        >
          {task.priority}
        </Text>
      </View>

      {total > 0 ? (
        <View className="mt-4">
          <View className="flex-row justify-between">
            <Text className="text-[11px] font-bold text-subtle dark:text-dark-subtle">
              Subtasks
            </Text>
            <Text className="text-[11px] font-bold text-subtle dark:text-dark-subtle">
              {done}/{total}
            </Text>
          </View>
          <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
            <View
              className="h-full rounded-full bg-accent dark:bg-dark-accent"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </View>
        </View>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          {task.assignees.length === 0 ? (
            <View className="h-7 w-7 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
              <Text className="text-[10px] font-black text-subtle dark:text-dark-subtle">
                ?
              </Text>
            </View>
          ) : (
            <>
              {task.assignees.slice(0, 3).map((assignee, index) => (
                <View
                  key={`${assignee.id ?? assignee.initials}-${index}`}
                  className="-ml-1.5 h-7 w-7 items-center justify-center rounded-full border border-glass bg-glass-button first:ml-0 dark:border-dark-glass dark:bg-dark-glass-button"
                >
                  <Text className="text-[10px] font-black text-primary dark:text-dark-primary">
                    {assignee.initials}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="calendar-outline" size={14} color="#c56010" />
          <Text className="text-xs font-bold text-muted dark:text-dark-muted">
            {task.dueDate}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function NewTaskDrawer({
  visible,
  project,
  defaultStatus,
  canAssign,
  currentUserId,
  submitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  project: Project | null;
  defaultStatus: TaskStatus;
  canAssign: boolean;
  currentUserId?: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [subtasks, setSubtasks] = useState<CreateSubtaskDraft[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setDescription("");
    setStatus(defaultStatus);
    setPriority("Medium");
    setDueDate("");
    setSubtasks([]);
    setAssigneeIds([]);
  }, [defaultStatus, visible]);

  const assignableMembers = (project?.teamMembers ?? []).filter(
    (member) => member.role !== "VIEWER" && (member.userId || member.id),
  );

  const submit = async () => {
    if (!title.trim()) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate,
      dueDateIso: dueDate.trim()
        ? new Date(`${dueDate.trim()}T00:00:00`).toISOString()
        : null,
      assigneeIds: canAssign
        ? assigneeIds
        : currentUserId
          ? [currentUserId]
          : [],
      subtasks: subtasks
        .map((subtask) => ({
          ...subtask,
          label: subtask.label.trim(),
        }))
        .filter((subtask) => subtask.label),
    });
  };

  const addSubtask = () => {
    setSubtasks((current) => [
      ...current,
      {
        id: `new-${Date.now()}`,
        label: "",
        done: false,
      },
    ]);
  };

  const updateSubtask = (id: string, patch: Partial<CreateSubtaskDraft>) => {
    setSubtasks((current) =>
      current.map((subtask) =>
        subtask.id === id ? { ...subtask, ...patch } : subtask,
      ),
    );
  };

  const removeSubtask = (id: string) => {
    setSubtasks((current) => current.filter((subtask) => subtask.id !== id));
  };

  return (
    <BottomDrawer
      visible={visible}
      title="Create Task"
      subtitle="Add work to this project board."
      closeDisabled={submitting}
      onClose={onClose}
    >
      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Title
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Task title"
          placeholderTextColor={palette.muted}
          className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
        />
      </View>

      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What needs to happen?"
          placeholderTextColor={palette.muted}
          multiline
          textAlignVertical="top"
          className="min-h-[96px] rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
        />
      </View>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Status
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {TASK_COLUMNS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setStatus(item)}
              className={`rounded-full border px-3 py-2 ${
                status === item
                  ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                  : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
              }`}
            >
              <Text className="text-xs font-black text-primary dark:text-dark-primary">
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Priority
        </Text>
        <View className="flex-row gap-2">
          {TASK_PRIORITIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setPriority(item)}
              className={`flex-1 rounded-nova border px-3 py-2 ${
                priority === item
                  ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                  : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
              }`}
            >
              <Text className="text-center text-xs font-black text-primary dark:text-dark-primary">
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Due Date
        </Text>
        <CalendarField
          value={dueDate}
          onChange={setDueDate}
          placeholder="Select due date"
        />
      </View>

      {canAssign ? (
        <View>
          <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
            Assigned To
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {assignableMembers.map((member) => {
              const id = member.userId ?? member.id ?? "";
              const active = assigneeIds.includes(id);
              return (
                <Pressable
                  key={id}
                  onPress={() =>
                    setAssigneeIds((current) =>
                      active
                        ? current.filter((value) => value !== id)
                        : [...current, id],
                    )
                  }
                  className={`rounded-full border px-3 py-2 ${
                    active
                      ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                      : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                  }`}
                >
                  <Text className="text-xs font-black text-primary dark:text-dark-primary">
                    {member.name ?? member.email ?? member.initials}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
            Subtasks
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add subtask"
            onPress={addSubtask}
            className="h-9 w-9 items-center justify-center rounded-full bg-accent dark:bg-dark-accent"
          >
            <Ionicons name="add-outline" size={20} color={palette.white} />
          </Pressable>
        </View>

        <View className="gap-3">
          {subtasks.length === 0 ? (
            <Text className="text-sm text-muted dark:text-dark-muted">
              No subtasks yet.
            </Text>
          ) : (
            subtasks.map((subtask, index) => (
              <View
                key={subtask.id}
                className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
              >
                <View className="flex-row items-center gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle subtask ${index + 1}`}
                    onPress={() =>
                      updateSubtask(subtask.id, { done: !subtask.done })
                    }
                    className={`h-8 w-8 items-center justify-center rounded-nova border ${
                      subtask.done
                        ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
                        : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                    }`}
                  >
                    {subtask.done ? (
                      <Ionicons
                        name="checkmark-outline"
                        size={18}
                        color={palette.white}
                      />
                    ) : null}
                  </Pressable>

                  <TextInput
                    value={subtask.label}
                    onChangeText={(label) => updateSubtask(subtask.id, { label })}
                    placeholder={`Subtask ${index + 1}`}
                    placeholderTextColor={palette.muted}
                    className="flex-1 text-primary dark:text-dark-primary"
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove subtask ${index + 1}`}
                    onPress={() => removeSubtask(subtask.id)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-glass-button dark:bg-dark-glass-button"
                  >
                    <Ionicons name="close-outline" size={18} color={palette.muted} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      <Pressable
        disabled={submitting || !title.trim()}
        onPress={submit}
        className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
      >
        {submitting ? <ActivityIndicator color={palette.white} /> : null}
        <Text className="font-black text-white">
          {submitting ? "Creating..." : "Create Task"}
        </Text>
      </Pressable>
    </BottomDrawer>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeColumn, setActiveColumn] = useState<TaskStatus>("To Do");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchUser[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedInviteMembers, setSelectedInviteMembers] = useState<SelectedInviteMember[]>([]);
  const [invitingMembers, setInvitingMembers] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingSuggestion, setCreatingSuggestion] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const projectId = Array.isArray(id) ? id[0] : id;
  const role = useMemo(
    () => (project ? getProjectMemberRole(project, user?.id) : null),
    [project, user?.id],
  );
  const editable = canEditTasks(role);
  const assignable = canAssignTasks(role);
  const manageableTeam = canManageTeam(role);

  useEffect(() => {
    if (!teamOpen || !manageableTeam) return;
    const trimmed = memberQuery.trim();
    if (trimmed.length < 2) {
      setMemberResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      setMemberSearchLoading(true);
      searchUsersApi(trimmed)
        .then(setMemberResults)
        .catch((error) => {
          setMemberResults([]);
          showSnackbar({
            variant: "error",
            title: "User search failed",
            message: getApiErrorMessage(error, "Please try again."),
          });
        })
        .finally(() => setMemberSearchLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [manageableTeam, memberQuery, showSnackbar, teamOpen]);

  const existingMemberIds = useMemo(
    () =>
      new Set(
        (project?.teamMembers ?? [])
          .map((member) => member.userId ?? member.id)
          .filter(Boolean),
      ),
    [project?.teamMembers],
  );
  const selectedInviteIds = new Set(
    selectedInviteMembers.map((member) => member.user.id),
  );
  const filteredMemberResults = memberResults.filter(
    (result) =>
      !existingMemberIds.has(result.id) && !selectedInviteIds.has(result.id),
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [projectData, taskData, suggestionData] = await Promise.all([
        getProjectApi(projectId),
        listTasksByProjectApi(projectId),
        listProjectSuggestionsApi(projectId).catch(() => []),
      ]);
      setProject(projectData);
      setTasks(taskData);
      setSuggestions(suggestionData);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load project",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, showSnackbar]);

  useEffect(() => {
    void load();
  }, [load]);

  const tasksByColumn = useMemo(
    () =>
      TASK_COLUMNS.reduce(
        (acc, column) => {
          acc[column] = sortTasksInStatusColumn(
            tasks.filter((task) => task.status === column),
          );
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [tasks],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCreateTask = async (input: CreateTaskInput) => {
    if (!projectId) return;
    setCreatingTask(true);
    try {
      const task = await createTaskApi(projectId, input);
      setTasks((current) => [...current, task]);
      setNewTaskOpen(false);
      showSnackbar({
        variant: "success",
        title: "Task created",
        message: `"${input.title}" was added to the board.`,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Create failed",
        message: getApiErrorMessage(error, "Could not create the task."),
      });
      throw error;
    } finally {
      setCreatingTask(false);
    }
  };

  const handleCreateSuggestion = async () => {
    if (!projectId || !suggestionText.trim()) return;
    setCreatingSuggestion(true);
    try {
      const suggestion = await createProjectSuggestionApi(projectId, suggestionText);
      setSuggestions((current) => [suggestion, ...current]);
      setSuggestionText("");
      showSnackbar({ variant: "success", title: "Suggestion added" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Suggestion failed",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setCreatingSuggestion(false);
    }
  };

  const addInviteMember = (user: SearchUser) => {
    setSelectedInviteMembers((current) => [...current, { user, role: "MEMBER" }]);
    setMemberQuery("");
    setMemberResults([]);
  };

  const updateInviteRole = (userId: string, inviteRole: EditableProjectMemberRole) => {
    setSelectedInviteMembers((current) =>
      current.map((member) =>
        member.user.id === userId ? { ...member, role: inviteRole } : member,
      ),
    );
  };

  const inviteMembers = async () => {
    if (!projectId || selectedInviteMembers.length === 0) return;
    setInvitingMembers(true);
    try {
      await addProjectMembersApi(
        projectId,
        selectedInviteMembers.map((member) => ({
          userId: member.user.id,
          role: member.role,
        })),
      );
      const next = await getProjectApi(projectId);
      setProject(next);
      setSelectedInviteMembers([]);
      showSnackbar({
        variant: "success",
        title: "Team updated",
        message: "Selected members were added to the project.",
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Invite failed",
        message: getApiErrorMessage(error, "Could not add members."),
      });
    } finally {
      setInvitingMembers(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTaskApi(deleteTarget.id);
      setTasks((current) => current.filter((task) => task.id !== deleteTarget.id));
      setDeleteTarget(null);
      showSnackbar({ variant: "success", title: "Task deleted" });
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

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-main p-6 dark:bg-dark-main">
        <Text className="text-xl font-black text-primary dark:text-dark-primary">
          Project not found
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="gap-5 p-5 pb-32"
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Pressable onPress={() => router.back()} className="mb-4 flex-row items-center gap-2">
            <Ionicons name="chevron-back-outline" size={18} color={palette.accent} />
            <Text className="font-black text-accent dark:text-dark-accent">
              Projects
            </Text>
          </Pressable>
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[28px] font-black text-primary dark:text-dark-primary">
                {project.title}
              </Text>
              <Text className="mt-2 text-sm leading-5 text-muted dark:text-dark-muted">
                {project.description || "No description yet."}
              </Text>
            </View>
            <Text className="rounded-full border border-accent/50 px-2.5 py-1 text-[11px] font-black text-accent dark:border-dark-accent/50 dark:text-dark-accent">
              {projectStatusLabel(project.status)}
            </Text>
          </View>
          <View className="mt-5">
            <View className="h-2 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
              <View
                className="h-full rounded-full bg-accent dark:bg-dark-accent"
                style={{ width: `${project.progress}%` }}
              />
            </View>
              <Text className="mt-2 text-xs font-bold text-muted dark:text-dark-muted">
              {project.progress}% complete - {tasks.length} on board
            </Text>
            {role ? (
              <Text className="mt-3 self-start rounded-full border border-accent/40 px-3 py-1 text-xs font-black text-accent dark:text-dark-accent">
                {role}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="grid gap-3">
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setTeamOpen(true)}
              className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="people-outline" size={18} color={palette.accent} />
              <Text className="font-black text-primary dark:text-dark-primary">
                {manageableTeam ? "Team" : "View Team"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSuggestionsOpen(true)}
              className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.accent} />
              <Text className="font-black text-primary dark:text-dark-primary">
                Ideas
              </Text>
            </Pressable>
          </View>
          {editable ? (
            <Pressable
              onPress={() => setNewTaskOpen(true)}
              className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-nova bg-accent dark:bg-dark-accent"
            >
              <Ionicons name="add-outline" size={22} color={palette.white} />
              <Text className="font-black text-white">New Task</Text>
            </Pressable>
          ) : role === "VIEWER" ? (
            <View className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
              <Text className="text-sm font-bold text-muted dark:text-dark-muted">
                Viewer access: you can read tasks, team, and suggestions only.
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {TASK_COLUMNS.map((column) => {
            const active = activeColumn === column;
            return (
              <Pressable
                key={column}
                onPress={() => setActiveColumn(column)}
                className={`rounded-full border px-4 py-2 ${
                  active
                    ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                    : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                }`}
              >
                <Text className="text-xs font-black text-primary dark:text-dark-primary">
                  {column} ({tasksByColumn[column].length})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className={`rounded-nova-xl border bg-glass-card p-4 dark:bg-dark-glass-card ${statusStyle[activeColumn]}`}>
          <Text className="mb-3 text-[17px] font-black text-primary dark:text-dark-primary">
            {activeColumn}
          </Text>
          <View className="gap-3">
            {tasksByColumn[activeColumn].length === 0 ? (
              <Text className="py-6 text-center text-sm text-muted dark:text-dark-muted">
                No tasks in this column.
              </Text>
            ) : (
              tasksByColumn[activeColumn].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={(item) =>
                    router.push({
                      pathname: "/task/[id]",
                      params: { id: item.id, projectId },
                    })
                  }
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <NewTaskDrawer
        visible={newTaskOpen}
        project={project}
        defaultStatus={activeColumn}
        canAssign={assignable}
        currentUserId={user?.id}
        submitting={creatingTask}
        onClose={() => {
          if (!creatingTask) setNewTaskOpen(false);
        }}
        onSubmit={handleCreateTask}
      />

      <BottomDrawer
        visible={teamOpen}
        title="Project Team"
        subtitle={`${project.teamMembers.length} member${project.teamMembers.length === 1 ? "" : "s"}`}
        closeDisabled={invitingMembers}
        onClose={() => {
          if (!invitingMembers) setTeamOpen(false);
        }}
      >
        {manageableTeam ? (
          <View className="gap-3 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-[15px] font-black text-primary dark:text-dark-primary">
              Add members
            </Text>
            <TextInput
              value={memberQuery}
              onChangeText={setMemberQuery}
              placeholder="Search by name or email..."
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
            />
            {memberQuery.trim().length >= 2 ? (
              <View className="rounded-nova border border-glass bg-sidebar p-1.5 dark:border-dark-glass dark:bg-dark-sidebar">
                {memberSearchLoading ? (
                  <Text className="px-3 py-2 text-sm text-muted dark:text-dark-muted">
                    Searching...
                  </Text>
                ) : filteredMemberResults.length === 0 ? (
                  <Text className="px-3 py-2 text-sm text-muted dark:text-dark-muted">
                    No users found.
                  </Text>
                ) : (
                  filteredMemberResults.slice(0, 5).map((result) => (
                    <Pressable
                      key={result.id}
                      onPress={() => addInviteMember(result)}
                      className="rounded-nova px-3 py-2 active:bg-glass-button dark:active:bg-dark-glass-button"
                    >
                      <Text className="font-black text-primary dark:text-dark-primary">
                        {result.fullName}
                      </Text>
                      <Text className="text-xs text-muted dark:text-dark-muted">
                        {result.email}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            {selectedInviteMembers.map((member) => (
              <View key={member.user.id} className="rounded-nova border border-glass bg-glass-button p-3 dark:border-dark-glass dark:bg-dark-glass-button">
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="font-black text-primary dark:text-dark-primary">
                      {member.user.fullName}
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {member.user.email}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setSelectedInviteMembers((current) =>
                        current.filter((item) => item.user.id !== member.user.id),
                      )
                    }
                    className="h-8 w-8 items-center justify-center rounded-full bg-glass-card dark:bg-dark-glass-card"
                  >
                    <Ionicons name="close-outline" size={18} color={palette.muted} />
                  </Pressable>
                </View>
                <View className="mt-3 flex-row gap-2">
                  {inviteRoles.map((inviteRole) => (
                    <Pressable
                      key={inviteRole}
                      onPress={() => updateInviteRole(member.user.id, inviteRole)}
                      className={`flex-1 rounded-full border px-2 py-1.5 ${
                        member.role === inviteRole
                          ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                          : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
                      }`}
                    >
                      <Text className="text-center text-[10px] font-black text-primary dark:text-dark-primary">
                        {inviteRole}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            <Pressable
              disabled={invitingMembers || selectedInviteMembers.length === 0}
              onPress={inviteMembers}
              className="min-h-[46px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
            >
              <Text className="font-black text-white">
                {invitingMembers ? "Adding..." : "Add Selected Members"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {project.teamMembers.map((member) => (
          <View key={member.userId ?? member.id ?? member.initials} className="flex-row items-center gap-3 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-glass-button dark:bg-dark-glass-button">
              <Text className="font-black text-primary dark:text-dark-primary">{member.initials}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-black text-primary dark:text-dark-primary">{member.name ?? member.email ?? member.initials}</Text>
              <Text className="text-xs text-muted dark:text-dark-muted">{member.email ?? "No email"}</Text>
            </View>
            <Text className="rounded-full border border-accent/40 px-2 py-1 text-[10px] font-black text-accent dark:text-dark-accent">{member.role}</Text>
          </View>
        ))}
      </BottomDrawer>

      <BottomDrawer
        visible={suggestionsOpen}
        title="Project Suggestions"
        subtitle="Comments and ideas attached to this project."
        onClose={() => setSuggestionsOpen(false)}
      >
        <TextInput
          value={suggestionText}
          onChangeText={setSuggestionText}
          placeholder="Add a suggestion..."
          placeholderTextColor={palette.muted}
          multiline
          textAlignVertical="top"
          className="min-h-[92px] rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
        />
        <Pressable
          disabled={creatingSuggestion || !suggestionText.trim()}
          onPress={handleCreateSuggestion}
          className="min-h-[48px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
        >
          <Text className="font-black text-white">{creatingSuggestion ? "Adding..." : "Add Suggestion"}</Text>
        </Pressable>
        {suggestions.map((suggestion) => (
          <View key={suggestion.id} className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="font-bold leading-5 text-primary dark:text-dark-primary">{suggestion.content}</Text>
            <Text className="mt-2 text-xs text-muted dark:text-dark-muted">{suggestion.status} - {suggestion.author?.fullName ?? "Unknown"}</Text>
          </View>
        ))}
      </BottomDrawer>

      <ConfirmationPopup
        visible={Boolean(deleteTarget)}
        title="Delete task?"
        message="This permanently removes the task and its subtasks."
        confirmLabel={deleting ? "Deleting..." : "Delete task"}
        variant="danger"
        icon="trash-outline"
        loading={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteTask}
      />
    </View>
  );
}
