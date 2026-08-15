"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KanbanSkeleton } from "@/components/skeletons/KanbanSkeleton";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Clock,
  MessageSquare,
  MoreHorizontal,
  PenLine,
  Plus,
  Users,
} from "lucide-react";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useUser } from "@/components/providers/UserProvider";
import { ManageTeamModal } from "@/components/projects/ManageTeamModal";
import { ProjectActivityStrip } from "@/components/projects/ProjectActivityStrip";
import { ProjectSuggestionsDrawer } from "@/components/projects/ProjectSuggestionsDrawer";
import { TaskCard } from "@/components/tasks/TaskCard";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { Select } from "@/components/ui/Select";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { UserAvatar } from "@/components/users/UserAvatar";
import { UserProfileLink } from "@/components/users/UserProfileLink";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  TASK_COLUMNS,
  sortTasksInStatusColumn,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { listProjectActivityApi, type ProjectActivityItem } from "@/lib/api/projects";
import { projectStatusLabel, shouldOfferMarkProjectComplete, type Project } from "@/lib/projects";
import {
  filterBoardTasks,
  taskMatchesBoardFilters,
  type BoardPersonFilter,
  type BoardPriorityFilter,
  type BoardWhenFilter,
} from "@/lib/project-board-filters";
import { normalizeMention } from "@/lib/mentions";
import {
  canAssignProjectTasks,
  canEditProjectTasks,
  canManageProjectTeam,
  useProjectRole,
} from "@/lib/useProjectRole";

const statusStyles: Record<Project["status"], string> = {
  Active: "border-accent/50 text-accent",
  "In Progress": "border-warning/50 text-warning",
  Completed: "border-success/50 text-success",
  Archived: "border-primary/30 text-primary/55",
};

export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { profile } = useUser();
  const projectId = typeof params.id === "string" ? params.id : "";
  const currentRole = useProjectRole(projectId, profile?.id);
  const canEditTasks = canEditProjectTasks(currentRole);
  const canAssignTasks = canAssignProjectTasks(currentRole);
  const canAssignSubtasks = canEditTasks;
  const canManageTeam =
    !profile?.isDemo && canManageProjectTeam(currentRole);
  const canMarkComplete = canManageProjectTeam(currentRole);

  const {
    getProject,
    getTasks,
    projectDetailLoading,
    loadProjectWorkspace,
    createTask,
    updateTask,
    deleteTask,
    updateProject,
  } = useAppData();

  useEffect(() => {
    if (projectId) loadProjectWorkspace(projectId);
  }, [projectId, loadProjectWorkspace]);

  const project = getProject(projectId);
  const tasks = getTasks(projectId);
  const isLoading = projectDetailLoading === projectId;
  const assigneeOptions = useMemo(
    () =>
      (project?.teamMembers ?? [])
        .filter((member) => member.role !== "VIEWER")
        .map((member) => ({
          value: member.userId ?? member.id ?? "",
          label: member.name ?? member.email ?? member.initials,
          description: member.role,
        }))
        .filter((option) => option.value),
    [project?.teamMembers],
  );
  const subtaskAssigneeOptions = useMemo(() => {
    if (canAssignTasks) return assigneeOptions;
    if (currentRole !== "MEMBER" || !profile?.id) return [];
    return assigneeOptions.filter((option) => option.value === profile.id);
  }, [assigneeOptions, canAssignTasks, currentRole, profile]);

  const mentionUsers = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; username: string; fullName: string }
    >();
    if (project?.owner?.id && project.owner.username) {
      byId.set(project.owner.id, {
        id: project.owner.id,
        username: normalizeMention(project.owner.username),
        fullName: project.owner.fullName,
      });
    }
    for (const member of project?.teamMembers ?? []) {
      const id = member.userId ?? member.id ?? "";
      if (!id || !member.username) continue;
      byId.set(id, {
        id,
        username: normalizeMention(member.username),
        fullName: member.name ?? member.email ?? member.initials,
      });
    }
    return [...byId.values()];
  }, [project?.owner, project?.teamMembers]);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] =
    useState<TaskStatus>("To Do");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const { menuRef: actionsMenuRef, style: actionsMenuStyle, precomputeStyle: precomputeActionsStyle } =
    useFloatingMenu(actionsTriggerRef, actionsOpen, 220, { minWidth: 200 });
  const closeActionsMenu = useCallback(() => setActionsOpen(false), []);
  useFloatingClickOutside(
    actionsOpen,
    closeActionsMenu,
    actionsTriggerRef,
    actionsMenuRef,
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [personFilter, setPersonFilter] = useState<BoardPersonFilter>("all");
  const [whenFilter, setWhenFilter] = useState<BoardWhenFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<BoardPriorityFilter>("all");
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listProjectActivityApi(projectId)
      .then((items) => {
        if (!cancelled) setActivity(items);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, tasks.length]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const deleteTaskItem = tasks.find((task) => task.id === deleteTaskId) ?? null;
  const queryTaskId = searchParams.get("task");
  const querySuggestions = searchParams.get("suggestions");
  const queryNewTask = searchParams.get("newTask");

  useEffect(() => {
    if (!queryTaskId) return;
    if (tasks.some((task) => task.id === queryTaskId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync task query param into drawer state
      setSelectedTaskId(queryTaskId);
    }
  }, [queryTaskId, tasks]);

  useEffect(() => {
    if (querySuggestions === "1" || querySuggestions === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync suggestions query param into drawer state
      setIsSuggestionsOpen(true);
    }
  }, [querySuggestions]);

  useEffect(() => {
    if (!project || !canEditTasks) return;
    if (queryNewTask !== "1" && queryNewTask !== "true") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open create-task modal from query
    setNewTaskDefaultStatus("To Do");
    setIsNewTaskOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("newTask");
    const qs = params.toString();
    router.replace(`/projects/${projectId}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }, [canEditTasks, project, projectId, queryNewTask, router, searchParams]);

  const myLateTasks = useMemo(
    () =>
      profile?.id
        ? tasks.filter((task) =>
            taskMatchesBoardFilters(task, profile.id, "late", "all"),
          )
        : [],
    [profile?.id, tasks],
  );

  const filteredTasks = useMemo(
    () => filterBoardTasks(tasks, personFilter, whenFilter, priorityFilter),
    [personFilter, priorityFilter, tasks, whenFilter],
  );

  const tasksByColumn = useMemo(() => {
    return TASK_COLUMNS.reduce(
      (acc, column) => {
        acc[column] = sortTasksInStatusColumn(
          filteredTasks.filter((task) => task.status === column),
        );
        return acc;
      },
      {} as Record<TaskStatus, Task[]>,
    );
  }, [filteredTasks]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    try {
      const saved = await updateTask(projectId, { ...task, status });
      if (selectedTaskId === taskId) {
        setSelectedTaskId(saved.id);
      }
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not move task",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const handleCreateTask = async (input: CreateTaskInput) => {
    setCreating(true);
    try {
      await createTask(projectId, input);
      toast({
        variant: "success",
        title: "Task created",
        message: `"${input.title}" was added to the board.`,
      });
      setIsNewTaskOpen(false);
    } catch (err) {
      toast({
        variant: "error",
        title: "Create failed",
        message:
          err instanceof ApiError ? err.message : "Could not create the task.",
      });
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const handleSaveTask = async (updated: Task) => {
    setSaving(true);
    try {
      const saved = await updateTask(projectId, updated);
      setSelectedTaskId(saved.id);
      toast({
        variant: "success",
        title: "Task saved",
        message: "Your changes were saved.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Save failed",
        message:
          err instanceof ApiError ? err.message : "Could not save the task.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return;
    setDeleting(true);
    try {
      await deleteTask(projectId, deleteTaskId);
      toast({
        variant: "success",
        title: "Task deleted",
        message: deleteTaskItem
          ? `"${deleteTaskItem.title}" was removed.`
          : "Task was removed.",
      });
      setSelectedTaskId(null);
      setDeleteTaskId(null);
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message:
          err instanceof ApiError ? err.message : "Could not delete the task.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const openNewTaskModal = (status: TaskStatus = "To Do") => {
    setNewTaskDefaultStatus(status);
    setIsNewTaskOpen(true);
  };

  const personOptions = useMemo(
    () =>
      (project?.teamMembers ?? [])
        .map((member) => ({
          id: member.userId ?? member.id ?? "",
          label: member.name ?? member.email ?? member.initials,
        }))
        .filter((member) => member.id),
    [project?.teamMembers],
  );

  const showMarkComplete = project
    ? canMarkComplete &&
      shouldOfferMarkProjectComplete(
        project.status,
        tasks.length,
        tasks.filter((task) => task.status === "Completed").length,
      )
    : false;

  const handleMarkComplete = async () => {
    if (!project || markingComplete) return;
    setMarkingComplete(true);
    try {
      await updateProject(projectId, {
        title: project.title,
        description: project.description,
        status: "Completed",
        contributorIds: project.contributorIds ?? [],
      });
      toast({
        variant: "success",
        title: "Project completed",
        message: `"${project.title}" is now complete.`,
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not mark complete",
        message:
          err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setMarkingComplete(false);
    }
  };

  const closeTaskDrawer = () => {
    if (saving) return;
    setSelectedTaskId(null);
    if (queryTaskId) {
      router.replace(`/projects/${projectId}`, { scroll: false });
    }
  };

  const closeSuggestionsDrawer = () => {
    setIsSuggestionsOpen(false);
    if (querySuggestions) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("suggestions");
      const qs = params.toString();
      router.replace(`/projects/${projectId}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    }
  };

  if (isLoading) {
    return <KanbanSkeleton />;
  }

  if (!project) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-primary">Project not found</h1>
        <p className="text-sm text-primary/60">
          This project may have been deleted or the link is invalid.
        </p>
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-primary">
              {project.title}
            </h1>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                statusStyles[project.status],
              )}
            >
              {projectStatusLabel(project.status)}
            </span>
            {showMarkComplete && (
              <button
                type="button"
                onClick={() => void handleMarkComplete()}
                disabled={markingComplete}
                className="inline-flex items-center gap-1.5 rounded-full border border-success/50 bg-success/15 px-2.5 py-1 text-xs font-semibold text-success transition hover:bg-success/25 disabled:opacity-60"
              >
                <Check className="size-3.5" />
                {markingComplete ? "Saving…" : "Mark complete"}
              </button>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-primary/60">
            {project.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-glass-button">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <span className="text-xs text-primary/55">
                {project.progress}% complete
              </span>
            </div>

            {project.totalTasks != null && (
              <span className="text-xs text-primary/50">
                {project.completedTasks ?? 0}/{project.totalTasks} tasks done
              </span>
            )}

            {project.totalSubtasks != null && project.totalSubtasks > 0 && (
              <span className="text-xs text-primary/50">
                {project.completedSubtasks ?? 0}/{project.totalSubtasks} subtasks
              </span>
            )}

            {project.owner && (
              <span className="text-xs text-primary/50">
                Owner:{" "}
                <UserProfileLink
                  userId={project.owner.id}
                  className="font-medium text-primary/60"
                  title={`View ${project.owner.fullName}`}
                >
                  {project.owner.fullName}
                </UserProfileLink>
                {project.owner.roleTitle ? ` · ${project.owner.roleTitle}` : ""}
              </span>
            )}

            {project.teamMembers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center">
                  {project.teamMembers.slice(0, 5).map((member, i) => (
                    <UserProfileLink
                      key={`${member.initials}-${i}`}
                      userId={member.userId ?? member.id}
                      className={cn(
                        "flex size-6 items-center justify-center overflow-hidden rounded-full border border-accent/30",
                        i > 0 && "-ml-1.5",
                      )}
                      title={member.name ?? member.initials}
                    >
                      <UserAvatar
                        name={member.name}
                        avatarUrl={member.imageUrl}
                        initials={member.initials}
                        size="xs"
                        className="border-0"
                      />
                    </UserProfileLink>
                  ))}
                </div>
                <span className="text-xs text-primary/50">
                  {project.teamMembers.length} member
                  {project.teamMembers.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            <span className="text-xs text-primary/40">
              {tasks.length} on board
            </span>

            {project.createdAt && (
              <span className="text-xs text-primary/40">
                Created{" "}
                {new Date(project.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {project.updatedAt && project.updatedAt !== project.createdAt && (
              <span className="text-xs text-primary/40">
                Updated{" "}
                {new Date(project.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {canEditTasks && (
            <button
              type="button"
              onClick={() => openNewTaskModal("To Do")}
              className="rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-4 py-2.5 text-sm font-semibold text-primary transition hover:opacity-90"
            >
              New Task
            </button>
          )}
          <button
            ref={actionsTriggerRef}
            type="button"
            aria-label="Project actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => {
              if (!actionsOpen) precomputeActionsStyle();
              setActionsOpen((open) => !open);
            }}
            className={cn(
              "flex size-10 items-center justify-center rounded-xl border border-glass bg-glass-button text-primary/70 transition hover:border-accent/40 hover:text-accent",
              actionsOpen && "border-accent/40 text-accent",
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
          <FloatingMenuPortal
            isOpen={actionsOpen}
            triggerRef={actionsTriggerRef}
            menuRef={actionsMenuRef}
            style={actionsMenuStyle}
            role="menu"
            className="overflow-hidden rounded-xl border border-glass bg-sidebar p-1 shadow-xl shadow-black/40 backdrop-blur-2xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActionsOpen(false);
                setIsTeamOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent"
            >
              <Users className="size-3.5 shrink-0" />
              {canManageTeam ? "Manage Team" : "View Team"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActionsOpen(false);
                setIsActivityOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent"
            >
              <Clock className="size-3.5 shrink-0" />
              Recent activity
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActionsOpen(false);
                setIsSuggestionsOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent"
            >
              <MessageSquare className="size-3.5 shrink-0" />
              Suggestions
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setActionsOpen(false);
                router.push(`/whiteboard?projectId=${projectId}`);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent"
            >
              <PenLine className="size-3.5 shrink-0" />
              Whiteboard
            </button>
          </FloatingMenuPortal>
        </div>
      </div>

      {myLateTasks.length > 0 && profile?.id ? (
        <button
          type="button"
          onClick={() => {
            setPersonFilter(profile.id);
            setWhenFilter("late");
          }}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-left transition hover:bg-warning/15"
        >
          <span className="text-sm font-semibold text-warning">
            {myLateTasks.length === 1
              ? `"${myLateTasks[0].title}" is late`
              : `${myLateTasks.length} of your tasks are late`}
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-warning/80">
            Show
          </span>
        </button>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="board-person-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Person
          </label>
          <Select
            id="board-person-filter"
            value={personFilter}
            onChange={(value) => setPersonFilter(value as BoardPersonFilter)}
            options={[
              { value: "all", label: "All people" },
              { value: "unassigned", label: "Unassigned" },
              ...personOptions.map((member) => ({
                value: member.id,
                label: member.label,
              })),
            ]}
            aria-label="Filter by person"
            searchable
            searchPlaceholder="Search people..."
          />
        </div>
        <div>
          <label
            htmlFor="board-when-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            When
          </label>
          <Select
            id="board-when-filter"
            value={whenFilter}
            onChange={(value) => setWhenFilter(value as BoardWhenFilter)}
            options={[
              { value: "all", label: "Everything" },
              { value: "late", label: "Late" },
              { value: "today", label: "Today" },
              { value: "week", label: "This week" },
            ]}
            aria-label="Filter by due date"
          />
        </div>
        <div>
          <label
            htmlFor="board-priority-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Priority
          </label>
          <Select
            id="board-priority-filter"
            value={priorityFilter}
            onChange={(value) =>
              setPriorityFilter(value as BoardPriorityFilter)
            }
            options={[
              { value: "all", label: "All priorities" },
              { value: "Low", label: "Low" },
              { value: "Medium", label: "Medium" },
              { value: "High", label: "High" },
            ]}
            aria-label="Filter by priority"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_COLUMNS.map((column) => {
          const isOver = dragOverColumn === column;
          return (
            <section
              key={column}
              onDragOver={(e) => {
                if (!canEditTasks) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverColumn !== column) setDragOverColumn(column);
              }}
              onDragLeave={(e) => {
                if (!canEditTasks) return;
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverColumn(null);
                }
              }}
              onDrop={(e) => {
                if (!canEditTasks) return;
                e.preventDefault();
                const taskId = e.dataTransfer.getData("taskId");
                if (taskId) void handleStatusChange(taskId, column);
                setDragOverColumn(null);
              }}
              className={cn(
                "min-w-0 rounded-2xl border p-3 transition-colors duration-150",
                isOver
                  ? "border-accent/70 bg-accent/5"
                  : "border-accent/35 bg-glass-card",
              )}
            >
              <div className="mb-4 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-primary">{column}</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-glass bg-glass-card px-2 py-0.5 text-xs text-primary/60">
                    {tasksByColumn[column].length}
                  </span>
                  {canEditTasks && (
                    <button
                      type="button"
                      onClick={() => openNewTaskModal(column)}
                      aria-label={`Add task to ${column}`}
                      className="rounded-lg border border-glass bg-glass-button p-1 text-primary/70 transition hover:text-accent"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {tasksByColumn[column].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTaskId(task.id)}
                    canMove={canEditTasks}
                  />
                ))}
                {isOver && tasksByColumn[column].length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-accent/40 py-8 text-center text-xs text-accent/60">
                    Drop here
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <SideDrawer
        isOpen={Boolean(selectedTask)}
        onClose={closeTaskDrawer}
        title="Task Details"
      >
        {selectedTask ? (
          <TaskDrawerDetails
            key={selectedTask.id}
            projectId={projectId}
            task={selectedTask}
            onSave={(task) => void handleSaveTask(task)}
            onDelete={() => setDeleteTaskId(selectedTask.id)}
            saving={saving}
            readOnly={!canEditTasks}
            projectRole={currentRole}
            mentionUsers={mentionUsers}
            canAssignTasks={canAssignTasks}
            assigneeOptions={assigneeOptions}
            canAssignSubtasks={canAssignSubtasks}
            subtaskAssigneeOptions={subtaskAssigneeOptions}
          />
        ) : null}
      </SideDrawer>

      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => !creating && setIsNewTaskOpen(false)}
        defaultStatus={newTaskDefaultStatus}
        onCreate={handleCreateTask}
        canAssignTasks={canAssignTasks}
        assigneeOptions={assigneeOptions}
        canAssignSubtasks={canAssignSubtasks}
        subtaskAssigneeOptions={subtaskAssigneeOptions}
        submitting={creating}
      />

      <SideDrawer
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        title="Recent activity"
      >
        <ProjectActivityStrip
          items={activity}
          onOpenTask={(taskId) => {
            setSelectedTaskId(taskId);
            setIsActivityOpen(false);
          }}
        />
      </SideDrawer>

      <SideDrawer
        isOpen={isSuggestionsOpen}
        onClose={closeSuggestionsDrawer}
        title="Project Suggestions"
      >
        <ProjectSuggestionsDrawer
          projectId={projectId}
          mentionUsers={mentionUsers}
          canConvert={canEditTasks}
          onConverted={async (task) => {
            await loadProjectWorkspace(projectId);
            setSelectedTaskId(task.id);
            setIsSuggestionsOpen(false);
            listProjectActivityApi(projectId)
              .then(setActivity)
              .catch(() => undefined);
          }}
        />
      </SideDrawer>

      {project && (
        <ManageTeamModal
          isOpen={isTeamOpen}
          onClose={() => setIsTeamOpen(false)}
          project={project}
          canManage={canManageTeam}
          onChanged={() => loadProjectWorkspace(projectId)}
        />
      )}

      <DeleteConfirmModal
        isOpen={Boolean(deleteTaskId)}
        onClose={() => !deleting && setDeleteTaskId(null)}
        onConfirm={handleDeleteTask}
        title="Delete task?"
        message="This permanently removes the task and its subtasks."
        itemName={deleteTaskItem?.title}
        confirmLabel={deleting ? "Deleting…" : "Delete task"}
      />
    </div>
  );
}
