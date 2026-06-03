"use client";

import { useEffect, useMemo, useState } from "react";
import { KanbanSkeleton } from "@/components/skeletons/KanbanSkeleton";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { TaskCard } from "@/components/tasks/TaskCard";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  TASK_COLUMNS,
  sortTasksInStatusColumn,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { projectStatusLabel, type Project } from "@/lib/projects";

const statusStyles: Record<Project["status"], string> = {
  Active: "border-accent/50 text-accent",
  "In Progress": "border-warning/50 text-warning",
  Completed: "border-success/50 text-success",
  Archived: "border-primary/30 text-primary/55",
};

export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = typeof params.id === "string" ? params.id : "";

  const {
    getProject,
    getTasks,
    projectDetailLoading,
    loadProjectWorkspace,
    createTask,
    updateTask,
    deleteTask,
  } = useAppData();

  useEffect(() => {
    if (projectId) loadProjectWorkspace(projectId);
  }, [projectId, loadProjectWorkspace]);

  const project = getProject(projectId);
  const tasks = getTasks(projectId);
  const isLoading = projectDetailLoading === projectId;

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] =
    useState<TaskStatus>("To Do");
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const deleteTaskItem = tasks.find((task) => task.id === deleteTaskId) ?? null;

  const tasksByColumn = useMemo(() => {
    return TASK_COLUMNS.reduce(
      (acc, column) => {
        acc[column] = sortTasksInStatusColumn(
          tasks.filter((task) => task.status === column),
        );
        return acc;
      },
      {} as Record<TaskStatus, Task[]>,
    );
  }, [tasks]);

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
                Owner: {project.owner.fullName}
                {project.owner.roleTitle ? ` · ${project.owner.roleTitle}` : ""}
              </span>
            )}

            {project.teamMembers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center">
                  {project.teamMembers.slice(0, 5).map((member, i) => (
                    <div
                      key={`${member.initials}-${i}`}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full border border-accent/30 bg-glass-button text-[9px] font-semibold text-primary",
                        i > 0 && "-ml-1.5",
                      )}
                      title={member.name ?? member.initials}
                    >
                      {member.initials}
                    </div>
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

        <button
          type="button"
          onClick={() => openNewTaskModal("To Do")}
          className="rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-4 py-2.5 text-sm font-semibold text-primary transition hover:opacity-90"
        >
          New Task
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_COLUMNS.map((column) => {
          const isOver = dragOverColumn === column;
          return (
            <section
              key={column}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverColumn !== column) setDragOverColumn(column);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverColumn(null);
                }
              }}
              onDrop={(e) => {
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
                  <button
                    type="button"
                    onClick={() => openNewTaskModal(column)}
                    aria-label={`Add task to ${column}`}
                    className="rounded-lg border border-glass bg-glass-button p-1 text-primary/70 transition hover:text-accent"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {tasksByColumn[column].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTaskId(task.id)}
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
        onClose={() => !saving && setSelectedTaskId(null)}
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
          />
        ) : null}
      </SideDrawer>

      <NewTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => !creating && setIsNewTaskOpen(false)}
        defaultStatus={newTaskDefaultStatus}
        onCreate={handleCreateTask}
        submitting={creating}
      />

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
