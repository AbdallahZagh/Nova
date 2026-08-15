import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  addProjectMembersApi,
  deleteProjectMemberApi,
  type EditableProjectMemberRole,
  getProjectApi,
  getProjectMemberRole,
  listProjectActivityApi,
  projectStatusLabel,
  shouldOfferMarkProjectComplete,
  type ProjectActivityItem,
  type Project,
  type ProjectTeamMember,
  updateProjectApi,
  updateProjectMemberRoleApi,
} from "@/api/projects";
import { searchUsersApi, type SearchUser } from "@/api/users";
import { suggestTaskAiApi } from "@/api/ai";
import {
  convertProjectSuggestionApi,
  createProjectSuggestionApi,
  deleteProjectSuggestionApi,
  listProjectSuggestionsApi,
  PROJECT_SUGGESTION_STATUS_OPTIONS,
  updateProjectSuggestionApi,
  type ProjectSuggestion,
} from "@/api/projectSuggestions";
import {
  createTaskApi,
  deleteTaskApi,
  formatActivityTime,
  listTasksByProjectApi,
  patchTaskStatusApi,
  sortTasksInStatusColumn,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { ActionSheet } from "@/components/ActionSheet";
import { BottomDrawer } from "@/components/BottomDrawer";
import { CalendarField } from "@/components/CalendarField";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { MultiSelectField } from "@/components/MultiSelectField";
import { SelectField } from "@/components/SelectField";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import { PageSkeleton } from "@/components/Skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { UserProfileLink } from "@/components/UserProfileLink";
import { mentionUsersFromPeople } from "@/mentions";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";
import { consumeOpenNewTask } from "@/pendingProjectAction";
import {
  filterBoardTasks,
  taskMatchesBoardFilters,
  type BoardPersonFilter,
  type BoardPriorityFilter,
  type BoardWhenFilter,
} from "@/project-board-filters";

function activityLine(item: ProjectActivityItem) {
  const action = item.content
    ? item.content.charAt(0).toLowerCase() + item.content.slice(1)
    : "updated a task";
  if (item.taskTitle) {
    return `${item.authorName} ${action} · ${item.taskTitle}`;
  }
  return `${item.authorName} ${action}`;
}

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
  assigneeIds: string[];
};

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

const STATUS_OPTIONS = TASK_COLUMNS.map((status) => ({
  value: status,
  label: status,
}));

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: priority,
}));

const inviteRoles: EditableProjectMemberRole[] = ["ADMIN", "MEMBER", "VIEWER"];

function TaskCard({
  task,
  canEdit,
  onOpen,
  onMove,
}: {
  task: Task;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onMove: (task: Task) => void;
}) {
  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const total = task.subtasks.length;

  return (
    <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
      <Pressable accessibilityRole="button" onPress={() => onOpen(task)}>
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
                    className="-ml-1.5 first:ml-0"
                  >
                    <UserAvatar
                      name={assignee.name}
                      avatarUrl={assignee.avatarUrl}
                      initials={assignee.initials}
                      size="sm"
                    />
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

      {canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Move ${task.title}`}
          onPress={() => onMove(task)}
          className="mt-3 min-h-[44px] flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
        >
          <Ionicons name="swap-vertical-outline" size={16} color="#c56010" />
          <Text className="text-xs font-black text-primary dark:text-dark-primary">
            Move
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MoveTaskDrawer({
  task,
  busy,
  onClose,
  onMove,
  onDelete,
}: {
  task: Task | null;
  busy: boolean;
  onClose: () => void;
  onMove: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);

  return (
    <BottomDrawer
      visible={Boolean(task)}
      title="Move task"
      subtitle={task?.title}
      closeDisabled={busy}
      onClose={onClose}
    >
      <View className="gap-2">
        {TASK_COLUMNS.map((status) => {
          const active = task?.status === status;
          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              disabled={busy || active}
              onPress={() => onMove(status)}
              className={`min-h-[48px] flex-row items-center justify-between rounded-nova border px-4 ${
                active
                  ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                  : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
              }`}
            >
              <Text className="font-black text-primary dark:text-dark-primary">
                {status}
              </Text>
              {busy && !active ? (
                <ActivityIndicator color={palette.accent} />
              ) : active ? (
                <Ionicons name="checkmark" size={18} color={palette.accent} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={palette.subtle} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onDelete}
        className="mt-4 min-h-[48px] flex-row items-center justify-center gap-2 rounded-nova border border-danger/40 bg-danger/10 dark:border-dark-danger/40 dark:bg-dark-danger/10"
      >
        <Ionicons name="trash-outline" size={16} color={palette.danger} />
        <Text className="font-black text-danger dark:text-dark-danger">
          Delete task
        </Text>
      </Pressable>
    </BottomDrawer>
  );
}

function NewTaskDrawer({
  visible,
  project,
  defaultStatus,
  canAssign,
  canAssignSubtasks,
  currentUserId,
  isDemo,
  submitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  project: Project | null;
  defaultStatus: TaskStatus;
  canAssign: boolean;
  canAssignSubtasks: boolean;
  currentUserId?: string;
  isDemo?: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [subtasks, setSubtasks] = useState<CreateSubtaskDraft[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setDescription("");
    setStatus(defaultStatus);
    setPriority("Medium");
    setDueDate("");
    setSubtasks([]);
    setAssigneeIds([]);
    setGenerating(false);
  }, [defaultStatus, visible]);

  const assignableMembers = (project?.teamMembers ?? []).filter(
    (member) => member.role !== "VIEWER" && memberId(member),
  );
  const subtaskAssignableMembers = canAssign
    ? assignableMembers
    : assignableMembers.filter((member) => memberId(member) === currentUserId);

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
          assigneeIds: canAssignSubtasks ? subtask.assigneeIds : [],
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
        assigneeIds: [],
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
        {!isDemo ? (
          <Pressable
            disabled={generating || !title.trim()}
            onPress={async () => {
              const trimmed = title.trim();
              if (!trimmed || generating) {
                if (!trimmed) {
                  showSnackbar({
                    variant: "warning",
                    title: "Add a title first",
                    message: "The AI needs a task title before it can suggest details.",
                  });
                }
                return;
              }
              setGenerating(true);
              try {
                const suggestion = await suggestTaskAiApi(trimmed);
                setDescription(suggestion.description ?? "");
                setPriority(
                  suggestion.priority === "HIGH"
                    ? "High"
                    : suggestion.priority === "LOW"
                      ? "Low"
                      : "Medium",
                );
                setSubtasks(
                  (suggestion.subTasks ?? [])
                    .map((label) => label.trim())
                    .filter(Boolean)
                    .map((label, index) => ({
                      id: `ai-${Date.now()}-${index}`,
                      label,
                      done: false,
                      assigneeIds: [],
                    })),
                );
                if (typeof suggestion.suggestedDaysUntilDue === "number") {
                  const due = new Date();
                  due.setDate(
                    due.getDate() + Math.max(0, suggestion.suggestedDaysUntilDue),
                  );
                  const month = String(due.getMonth() + 1).padStart(2, "0");
                  const day = String(due.getDate()).padStart(2, "0");
                  setDueDate(`${due.getFullYear()}-${month}-${day}`);
                }
                showSnackbar({
                  variant: "success",
                  title: "Task details generated",
                  message: "Review the AI suggestions before creating the task.",
                });
              } catch (error) {
                showSnackbar({
                  variant: "error",
                  title: "AI suggestion failed",
                  message: getApiErrorMessage(error, "Could not generate task details."),
                });
              } finally {
                setGenerating(false);
              }
            }}
            className="mt-2 min-h-[46px] flex-row items-center justify-between rounded-nova border border-glass bg-glass-button px-3 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <View className="flex-1">
              <Text className="text-xs font-black text-primary dark:text-dark-primary">
                {generating ? "Generating task draft" : "Generate with AI"}
              </Text>
              <Text className="mt-0.5 text-[11px] text-muted dark:text-dark-muted">
                Fill description, priority, due date, and subtasks.
              </Text>
            </View>
            <Text className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-black text-accent dark:text-dark-accent">
              AI
            </Text>
          </Pressable>
        ) : null}
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

      <SelectField
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(value) => setStatus(value as TaskStatus)}
        title="Status"
      />

      <SelectField
        label="Priority"
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={(value) => setPriority(value as TaskPriority)}
        title="Priority"
      />

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
        <MultiSelectField
          label="Assigned To"
          value={assigneeIds}
          options={memberOptions(assignableMembers)}
          onChange={setAssigneeIds}
          placeholder="Select team members..."
          title="Assigned to"
          searchPlaceholder="Search people..."
        />
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
                {canAssignSubtasks ? (
                  <View className="mt-3">
                    <MultiSelectField
                      label="Assignees"
                      value={subtask.assigneeIds}
                      options={memberOptions(subtaskAssignableMembers)}
                      onChange={(assigneeIds) =>
                        updateSubtask(subtask.id, { assigneeIds })
                      }
                      placeholder="Assign subtask..."
                      title="Subtask assignees"
                      searchPlaceholder="Search people..."
                    />
                  </View>
                ) : null}
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
  const { id, suggestions: suggestionsParam, newTask: newTaskParam } = useLocalSearchParams<{
    id: string;
    suggestions?: string;
    newTask?: string;
  }>();
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);
  const [convertingSuggestionId, setConvertingSuggestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeColumn, setActiveColumn] = useState<TaskStatus>("To Do");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const openedNewTaskFromQuery = useRef(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [personFilter, setPersonFilter] = useState<BoardPersonFilter>("all");
  const [whenFilter, setWhenFilter] = useState<BoardWhenFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<BoardPriorityFilter>("all");
  const [teamOpen, setTeamOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchUser[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedInviteMembers, setSelectedInviteMembers] = useState<SelectedInviteMember[]>([]);
  const [invitingMembers, setInvitingMembers] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingSuggestion, setCreatingSuggestion] = useState(false);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, ProjectSuggestion>>({});
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Task | null>(null);
  const [moving, setMoving] = useState(false);
  const [memberRoleBusyId, setMemberRoleBusyId] = useState<string | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ProjectTeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [deleteSuggestionTarget, setDeleteSuggestionTarget] = useState<ProjectSuggestion | null>(null);
  const [deletingSuggestion, setDeletingSuggestion] = useState(false);

  const projectId = Array.isArray(id) ? id[0] : id;
  const role = useMemo(
    () => (project ? getProjectMemberRole(project, user?.id) : null),
    [project, user?.id],
  );
  const editable = canEditTasks(role);
  const assignable = canAssignTasks(role);
  const manageableTeam = !user?.isDemo && canManageTeam(role);
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
      const [projectData, taskData, suggestionData, activityData] = await Promise.all([
        getProjectApi(projectId),
        listTasksByProjectApi(projectId),
        listProjectSuggestionsApi(projectId).catch(() => []),
        listProjectActivityApi(projectId).catch(() => []),
      ]);
      setProject(projectData);
      setTasks(taskData);
      setSuggestions(suggestionData);
      setActivity(activityData);
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

  useEffect(() => {
    const value = Array.isArray(suggestionsParam) ? suggestionsParam[0] : suggestionsParam;
    if (value === "1" || value === "true") {
      setSuggestionsOpen(true);
    }
  }, [suggestionsParam]);

  useEffect(() => {
    if (openedNewTaskFromQuery.current) return;
    if (loading || !project || !editable) return;
    const fromQuery = Array.isArray(newTaskParam) ? newTaskParam[0] : newTaskParam;
    const shouldOpen =
      fromQuery === "1" ||
      fromQuery === "true" ||
      consumeOpenNewTask(project.id);
    if (!shouldOpen) return;
    openedNewTaskFromQuery.current = true;
    setNewTaskOpen(true);
  }, [editable, loading, newTaskParam, project]);

  const myLateTasks = useMemo(
    () =>
      user?.id
        ? tasks.filter((task) =>
            taskMatchesBoardFilters(task, user.id, "late", "all"),
          )
        : [],
    [tasks, user?.id],
  );

  const filteredTasks = useMemo(
    () => filterBoardTasks(tasks, personFilter, whenFilter, priorityFilter),
    [personFilter, priorityFilter, tasks, whenFilter],
  );

  const tasksByColumn = useMemo(
    () =>
      TASK_COLUMNS.reduce(
        (acc, column) => {
          acc[column] = sortTasksInStatusColumn(
            filteredTasks.filter((task) => task.status === column),
          );
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [filteredTasks],
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

  const showMarkComplete = project
    ? canManageTeam(role) &&
      shouldOfferMarkProjectComplete(
        project.status,
        tasks.length,
        tasks.filter((task) => task.status === "Completed").length,
      )
    : false;

  const handleMarkComplete = async () => {
    if (!project || !projectId || markingComplete) return;
    setMarkingComplete(true);
    try {
      const saved = await updateProjectApi(projectId, {
        title: project.title,
        description: project.description,
        status: "Completed",
      });
      setProject(saved);
      showSnackbar({
        variant: "success",
        title: "Project completed",
        message: `"${project.title}" is now complete.`,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not mark complete",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setMarkingComplete(false);
    }
  };

  const handleConvertSuggestion = async (suggestion: ProjectSuggestion) => {
    if (!projectId || suggestion.status === "Rejected" || convertingSuggestionId) {
      return;
    }
    setConvertingSuggestionId(suggestion.id);
    try {
      const result = await convertProjectSuggestionApi(suggestion.id);
      setSuggestions((current) =>
        current.map((item) =>
          item.id === result.suggestion.id ? result.suggestion : item,
        ),
      );
      setTasks((current) =>
        current.some((task) => task.id === result.task.id)
          ? current
          : [...current, result.task],
      );
      listProjectActivityApi(projectId)
        .then(setActivity)
        .catch(() => undefined);
      setSuggestionsOpen(false);
      showSnackbar({
        variant: "success",
        title: "Task created",
        message: `"${result.task.title}" is now on the board.`,
      });
      router.push({
        pathname: "/task/[id]",
        params: { id: result.task.id, projectId },
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not turn this idea into a task",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setConvertingSuggestionId(null);
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

  const updateMemberRole = async (
    userId: string,
    nextRole: EditableProjectMemberRole,
  ) => {
    if (!projectId || memberRoleBusyId) return;
    setMemberRoleBusyId(userId);
    try {
      await updateProjectMemberRoleApi(projectId, userId, nextRole);
      const next = await getProjectApi(projectId);
      setProject(next);
      showSnackbar({ variant: "success", title: "Role updated" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Role update failed",
        message: getApiErrorMessage(error, "Could not change this member's role."),
      });
    } finally {
      setMemberRoleBusyId(null);
    }
  };

  const confirmRemoveMember = async () => {
    if (!projectId || !removeMemberTarget) return;
    const userId = memberId(removeMemberTarget);
    if (!userId) return;
    setRemovingMember(true);
    try {
      await deleteProjectMemberApi(projectId, userId);
      const next = await getProjectApi(projectId);
      setProject(next);
      setRemoveMemberTarget(null);
      showSnackbar({ variant: "success", title: "Member removed" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Remove failed",
        message: getApiErrorMessage(error, "Could not remove this member."),
      });
    } finally {
      setRemovingMember(false);
    }
  };

  const startEditingSuggestion = (suggestion: ProjectSuggestion) => {
    setEditingSuggestionId(suggestion.id);
    setSuggestionDrafts((current) => ({ ...current, [suggestion.id]: suggestion }));
  };

  const saveSuggestion = async (id: string) => {
    const draft = suggestionDrafts[id];
    if (!draft || !draft.content.trim() || savingSuggestionId) return;
    setSavingSuggestionId(id);
    try {
      const saved = await updateProjectSuggestionApi(id, {
        content: draft.content,
        status: draft.status,
      });
      setSuggestions((current) =>
        current.map((item) => (item.id === id ? saved : item)),
      );
      setEditingSuggestionId(null);
      showSnackbar({ variant: "success", title: "Suggestion updated" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Update failed",
        message: getApiErrorMessage(error, "Could not update the suggestion."),
      });
    } finally {
      setSavingSuggestionId(null);
    }
  };

  const confirmDeleteSuggestion = async () => {
    if (!deleteSuggestionTarget) return;
    setDeletingSuggestion(true);
    try {
      await deleteProjectSuggestionApi(deleteSuggestionTarget.id);
      setSuggestions((current) =>
        current.filter((item) => item.id !== deleteSuggestionTarget.id),
      );
      if (editingSuggestionId === deleteSuggestionTarget.id) {
        setEditingSuggestionId(null);
      }
      setDeleteSuggestionTarget(null);
      showSnackbar({ variant: "success", title: "Suggestion deleted" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message: getApiErrorMessage(error, "Could not delete the suggestion."),
      });
    } finally {
      setDeletingSuggestion(false);
    }
  };

  const handleMoveTask = async (status: TaskStatus) => {
    if (!moveTarget || moveTarget.status === status) return;
    setMoving(true);
    try {
      const saved = await patchTaskStatusApi(moveTarget.id, status);
      setTasks((current) =>
        current.map((task) =>
          task.id === saved.id ? { ...task, status: saved.status } : task,
        ),
      );
      setActiveColumn(status);
      setMoveTarget(null);
      showSnackbar({
        variant: "success",
        title: "Task moved",
        message: `"${moveTarget.title}" is now in ${status}.`,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Move failed",
        message: getApiErrorMessage(error, "Could not update the task."),
      });
    } finally {
      setMoving(false);
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
          <View className="mb-4 flex-row items-center justify-between gap-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
              <Ionicons name="chevron-back-outline" size={18} color={palette.accent} />
              <Text className="font-black text-accent dark:text-dark-accent">
                Projects
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Project actions"
              onPress={() => setActionsOpen(true)}
              className="h-10 w-10 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={palette.primary} />
            </Pressable>
          </View>
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
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <Text className="text-xs font-bold text-muted dark:text-dark-muted">
                {project.progress}% complete · {tasks.length} on board
              </Text>
              {role ? (
                <Text className="rounded-full border border-accent/40 px-2.5 py-0.5 text-[11px] font-black text-accent dark:text-dark-accent">
                  {role}
                </Text>
              ) : null}
              {showMarkComplete ? (
                <Pressable
                  onPress={() => void handleMarkComplete()}
                  disabled={markingComplete}
                  className="flex-row items-center gap-1 rounded-full border border-success/50 bg-success/15 px-2.5 py-1 dark:border-dark-success/50 dark:bg-dark-success/15"
                >
                  {markingComplete ? (
                    <ActivityIndicator size="small" color={palette.success} />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={14} color={palette.success} />
                  )}
                  <Text className="text-[11px] font-black text-success dark:text-dark-success">
                    {markingComplete ? "Saving..." : "Mark complete"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {myLateTasks.length > 0 && user?.id ? (
          <Pressable
            onPress={() => {
              setPersonFilter(user.id);
              setWhenFilter("late");
            }}
            className="flex-row items-center gap-2 rounded-nova border border-warning/50 bg-warning/10 px-4 py-3 dark:border-dark-warning/50 dark:bg-dark-warning/10"
          >
            <Ionicons name="alert-circle-outline" size={18} color={palette.warning} />
            <Text className="flex-1 text-sm font-bold text-warning dark:text-dark-warning">
              {myLateTasks.length === 1
                ? `${myLateTasks[0].title} is late`
                : `${myLateTasks.length} of your tasks are late`}
            </Text>
            <Text className="text-xs font-black uppercase text-warning dark:text-dark-warning">
              Show
            </Text>
          </Pressable>
        ) : null}

        {editable ? (
          <Pressable
            onPress={() => setNewTaskOpen(true)}
            className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-nova bg-accent dark:bg-dark-accent"
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

        <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="mb-3 text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
            Filters
          </Text>
          <View className="gap-3">
            <SelectField
              label="Person"
              value={personFilter}
              options={[
                { value: "all", label: "All people" },
                { value: "unassigned", label: "Unassigned" },
                ...project.teamMembers
                  .map((member) => ({
                    value: member.userId ?? member.id ?? "",
                    label: member.name ?? member.email ?? member.initials,
                  }))
                  .filter((member) => member.value),
              ]}
              onChange={(value) => setPersonFilter(value as BoardPersonFilter)}
              title="Person"
              subtitle="Show cards assigned to someone."
              searchable
              searchPlaceholder="Search people..."
            />
            <SelectField
              label="When"
              value={whenFilter}
              options={[
                { value: "all", label: "Everything" },
                { value: "late", label: "Late" },
                { value: "today", label: "Today" },
                { value: "week", label: "This week" },
              ]}
              onChange={(value) => setWhenFilter(value as BoardWhenFilter)}
              title="When"
              subtitle="Filter by due date."
            />
            <SelectField
              label="Priority"
              value={priorityFilter}
              options={[
                { value: "all", label: "All priorities" },
                { value: "Low", label: "Low" },
                { value: "Medium", label: "Medium" },
                { value: "High", label: "High" },
              ]}
              onChange={(value) =>
                setPriorityFilter(value as BoardPriorityFilter)
              }
              title="Priority"
              subtitle="Filter by task priority."
            />
          </View>
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
          <Text className="mb-1 text-[17px] font-black text-primary dark:text-dark-primary">
            {activeColumn}
          </Text>
          {editable ? (
            <Text className="mb-3 text-xs text-muted dark:text-dark-muted">
              Open a task for details. Use Move to change its status.
            </Text>
          ) : (
            <View className="mb-3" />
          )}
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
                  canEdit={editable}
                  onOpen={(item) =>
                    router.push({
                      pathname: "/task/[id]",
                      params: { id: item.id, projectId },
                    })
                  }
                  onMove={setMoveTarget}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <ActionSheet
        visible={actionsOpen}
        title="Project"
        onClose={() => setActionsOpen(false)}
        actions={[
          {
            key: "team",
            icon: "people-outline",
            label: manageableTeam ? "Team" : "View Team",
            onPress: () => {
              setActionsOpen(false);
              setTeamOpen(true);
            },
          },
          {
            key: "activity",
            icon: "time-outline",
            label: "Recent activity",
            onPress: () => {
              setActionsOpen(false);
              setActivityOpen(true);
            },
          },
          {
            key: "ideas",
            icon: "chatbubble-ellipses-outline",
            label: "Ideas",
            onPress: () => {
              setActionsOpen(false);
              setSuggestionsOpen(true);
            },
          },
          {
            key: "whiteboard",
            icon: "brush-outline",
            label: "Whiteboard",
            onPress: () => {
              setActionsOpen(false);
              router.push(`/(main)/whiteboard?projectId=${projectId}` as Href);
            },
          },
        ]}
      />

      <NewTaskDrawer
        visible={newTaskOpen}
        project={project}
        defaultStatus={activeColumn}
        canAssign={assignable}
        canAssignSubtasks={editable}
        currentUserId={user?.id}
        isDemo={user?.isDemo}
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

        {project.teamMembers.map((member) => {
          const id = memberId(member);
          const canEditMember = manageableTeam && member.role !== "OWNER";
          return (
            <View key={id || member.initials} className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
              <View className="flex-row items-center gap-3">
                <UserAvatar
                  name={member.name}
                  avatarUrl={member.imageUrl}
                  initials={member.initials}
                  size="lg"
                />
                <View className="flex-1">
                  <UserProfileLink userId={id}>
                    <Text className="font-black text-primary dark:text-dark-primary">{member.name ?? member.email ?? member.initials}</Text>
                  </UserProfileLink>
                  <Text className="text-xs text-muted dark:text-dark-muted">{member.email ?? "No email"}</Text>
                </View>
                {canEditMember ? (
                  <Pressable
                    onPress={() => setRemoveMemberTarget(member)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-danger/10 dark:bg-dark-danger/10"
                  >
                    <Ionicons name="trash-outline" size={16} color={palette.danger} />
                  </Pressable>
                ) : (
                  <Text className="rounded-full border border-accent/40 px-2 py-1 text-[10px] font-black text-accent dark:text-dark-accent">{member.role}</Text>
                )}
              </View>
              {canEditMember ? (
                <View className="mt-3 flex-row gap-2">
                  {inviteRoles.map((nextRole) => (
                    <Pressable
                      key={nextRole}
                      disabled={memberRoleBusyId === id}
                      onPress={() => void updateMemberRole(id, nextRole)}
                      className={`flex-1 rounded-full border px-2 py-1.5 disabled:opacity-50 ${
                        member.role === nextRole
                          ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                      }`}
                    >
                      <Text className="text-center text-[10px] font-black text-primary dark:text-dark-primary">
                        {nextRole}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </BottomDrawer>

      <BottomDrawer
        visible={activityOpen}
        title="Recent activity"
        subtitle="Latest moves and updates on this project."
        onClose={() => setActivityOpen(false)}
      >
        {activity.length === 0 ? (
          <Text className="py-6 text-center text-sm text-muted dark:text-dark-muted">
            No activity yet.
          </Text>
        ) : (
          activity.map((item) => (
            <Pressable
              key={item.id}
              disabled={!item.taskId}
              onPress={() => {
                if (!item.taskId) return;
                setActivityOpen(false);
                router.push({
                  pathname: "/task/[id]",
                  params: { id: item.taskId, projectId },
                });
              }}
              className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Text className="font-bold leading-5 text-primary dark:text-dark-primary">
                {activityLine(item)}
              </Text>
              <Text className="mt-2 text-xs text-muted dark:text-dark-muted">
                {formatActivityTime(item.createdAt)}
              </Text>
            </Pressable>
          ))
        )}
      </BottomDrawer>

      <BottomDrawer
        visible={suggestionsOpen}
        title="Project Suggestions"
        subtitle="Comments and ideas attached to this project."
        onClose={() => setSuggestionsOpen(false)}
        footer={
          <View className="gap-3">
            <MentionComposer
              value={suggestionText}
              onChange={setSuggestionText}
              users={mentionUsers}
              placeholder="Add a suggestion. Use @ to mention someone."
            />
            <Pressable
              disabled={creatingSuggestion || !suggestionText.trim()}
              onPress={handleCreateSuggestion}
              className="min-h-[48px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
            >
              <Text className="font-black text-white">
                {creatingSuggestion ? "Adding..." : "Add Suggestion"}
              </Text>
            </Pressable>
          </View>
        }
      >
        {suggestions.length === 0 ? (
          <Text className="py-6 text-center text-sm text-muted dark:text-dark-muted">
            No suggestions yet.
          </Text>
        ) : (
          suggestions.map((suggestion) => {
            const editing = editingSuggestionId === suggestion.id;
            const draft = suggestionDrafts[suggestion.id] ?? suggestion;
            return (
              <View
                key={suggestion.id}
                className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
              >
                {editing ? (
                  <TextInput
                    value={draft.content}
                    onChangeText={(content) =>
                      setSuggestionDrafts((current) => ({
                        ...current,
                        [suggestion.id]: { ...draft, content },
                      }))
                    }
                    multiline
                    textAlignVertical="top"
                    className="min-h-[72px] rounded-nova border border-glass bg-glass-button px-3 py-2 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
                  />
                ) : (
                  <MentionText
                    content={suggestion.content}
                    users={mentionUsers}
                    className="font-bold leading-5 text-primary dark:text-dark-primary"
                  />
                )}
                <UserProfileLink userId={suggestion.author?.id} className="mt-2">
                  <Text className="text-xs text-muted dark:text-dark-muted">
                    {suggestion.author?.fullName ?? "Unknown"}
                  </Text>
                </UserProfileLink>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {PROJECT_SUGGESTION_STATUS_OPTIONS.map((status) => (
                    <Pressable
                      key={status}
                      onPress={() => {
                        if (editing) {
                          setSuggestionDrafts((current) => ({
                            ...current,
                            [suggestion.id]: { ...draft, status },
                          }));
                          return;
                        }
                        void updateProjectSuggestionApi(suggestion.id, { status })
                          .then((saved) => {
                            setSuggestions((current) =>
                              current.map((item) => (item.id === saved.id ? saved : item)),
                            );
                          })
                          .catch((error) => {
                            showSnackbar({
                              variant: "error",
                              title: "Status update failed",
                              message: getApiErrorMessage(error, "Please try again."),
                            });
                          });
                      }}
                      className={`rounded-full border px-2.5 py-1 ${
                        (editing ? draft.status : suggestion.status) === status
                          ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                          : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                      }`}
                    >
                      <Text className="text-[10px] font-black text-primary dark:text-dark-primary">
                        {status}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View className="mt-3 gap-2">
                  {editing ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        disabled={savingSuggestionId === suggestion.id || !draft.content.trim()}
                        onPress={() => void saveSuggestion(suggestion.id)}
                        className="min-h-[40px] flex-1 items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
                      >
                        <Text className="text-xs font-black text-white">
                          {savingSuggestionId === suggestion.id ? "Saving..." : "Save"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingSuggestionId(null)}
                        className="min-h-[40px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                      >
                        <Text className="text-xs font-black text-primary dark:text-dark-primary">
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      {editable && suggestion.status !== "Rejected" ? (
                        <Pressable
                          disabled={convertingSuggestionId === suggestion.id}
                          onPress={() => void handleConvertSuggestion(suggestion)}
                          className="min-h-[40px] flex-row items-center justify-center gap-2 rounded-nova border border-accent/40 bg-accent/10 disabled:opacity-50 dark:border-dark-accent/40 dark:bg-dark-accent/10"
                        >
                          {convertingSuggestionId === suggestion.id ? (
                            <ActivityIndicator size="small" color={palette.accent} />
                          ) : (
                            <Ionicons name="list-outline" size={16} color={palette.accent} />
                          )}
                          <Text className="text-xs font-black text-accent dark:text-dark-accent">
                            {convertingSuggestionId === suggestion.id
                              ? "Creating..."
                              : "Turn into task"}
                          </Text>
                        </Pressable>
                      ) : null}
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => startEditingSuggestion(suggestion)}
                          className="min-h-[40px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                        >
                          <Text className="text-xs font-black text-primary dark:text-dark-primary">
                            Edit
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setDeleteSuggestionTarget(suggestion)}
                          className="min-h-[40px] flex-1 items-center justify-center rounded-nova border border-danger/40 bg-danger/10 dark:border-dark-danger/40 dark:bg-dark-danger/10"
                        >
                          <Text className="text-xs font-black text-danger dark:text-dark-danger">
                            Delete
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </BottomDrawer>

      <MoveTaskDrawer
        task={moveTarget}
        busy={moving}
        onClose={() => {
          if (!moving) setMoveTarget(null);
        }}
        onMove={(status) => {
          void handleMoveTask(status);
        }}
        onDelete={() => {
          if (!moveTarget) return;
          setDeleteTarget(moveTarget);
          setMoveTarget(null);
        }}
      />

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

      <ConfirmationPopup
        visible={Boolean(removeMemberTarget)}
        title="Remove member?"
        message={`${removeMemberTarget?.name ?? removeMemberTarget?.email ?? "This member"} will lose access to the project.`}
        confirmLabel={removingMember ? "Removing..." : "Remove member"}
        variant="danger"
        icon="person-remove-outline"
        loading={removingMember}
        onCancel={() => {
          if (!removingMember) setRemoveMemberTarget(null);
        }}
        onConfirm={confirmRemoveMember}
      />

      <ConfirmationPopup
        visible={Boolean(deleteSuggestionTarget)}
        title="Delete suggestion?"
        message="This permanently removes the suggestion."
        confirmLabel={deletingSuggestion ? "Deleting..." : "Delete suggestion"}
        variant="danger"
        icon="trash-outline"
        loading={deletingSuggestion}
        onCancel={() => {
          if (!deletingSuggestion) setDeleteSuggestionTarget(null);
        }}
        onConfirm={confirmDeleteSuggestion}
      />
    </View>
  );
}
