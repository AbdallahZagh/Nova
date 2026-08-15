"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { CalendarDays, FolderKanban, PenLine } from "lucide-react";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import {
  ActivityHeatmapSkeleton,
  ContinueStripSkeleton,
  MetricsCardsSkeleton,
  UrgentTasksTableSkeleton,
} from "@/components/skeletons/DashboardSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { GlassCard } from "@/components/ui/GlassCard";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useToast } from "@/components/ui/Toast";
import { useTaskDrawerContext } from "@/lib/useTaskDrawerContext";
import {
  getDashboardSummaryApi,
  type ActivityMap,
  type DashboardContinue,
  type DashboardMetrics,
  type UrgentTask,
} from "@/lib/api/dashboard";
import { getTaskApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/tasks";

type OpenTaskHandler = (taskId: string, projectId: string) => void;

function formatRelativeStamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PRIORITY_DOT: Record<string, string> = {
  High:   "bg-red-500 light:bg-red-600",
  Medium: "bg-amber-500 light:bg-amber-600",
  Low:    "bg-emerald-500 light:bg-emerald-600",
};

function UrgentTasksTable({
  tasks,
  onOpenTask,
}: {
  tasks: UrgentTask[];
  onOpenTask: OpenTaskHandler;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-primary/40">
        No open tasks with due dates.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-glass">
            <th className="pb-3 text-left text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Task
            </th>
            <th className="pb-3 text-left text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Project
            </th>
            <th className="pb-3 text-right text-[11px] font-medium uppercase tracking-widest text-primary/35">
              Due
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const label = task.dueLabel.toLowerCase();
            const isOverdue = label.includes("overdue");
            const isToday = label === "today";
            const canOpen = Boolean(task.projectId);

            return (
              <tr
                key={task.id}
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                onClick={() => {
                  if (task.projectId) onOpenTask(task.id, task.projectId);
                }}
                onKeyDown={(event) => {
                  if (!task.projectId) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTask(task.id, task.projectId);
                  }
                }}
                className={cn(
                  "group border-b border-glass/40 last:border-0 ",
                  canOpen && "cursor-pointer hover:bg-white/3",
                )}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5 pl-2">
                    <span
                      className={cn(
                        "mt-px size-2 shrink-0 rounded-full",
                        PRIORITY_DOT[task.priority] ?? "bg-primary/30",
                      )}
                    />
                    <span className="line-clamp-1 font-medium text-primary group-hover:text-accent">
                      {task.title}
                    </span>
                  </div>
                </td>

                <td className="py-3 pr-4">
                  <span className="rounded-md border border-glass bg-glass-button px-2 py-0.5 text-xs text-primary/65">
                    {task.projectName}
                  </span>
                </td>

                <td className="py-3 text-right pr-2">
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isOverdue
                        ? "text-red-400 light:text-red-600"
                        : isToday
                        ? "text-amber-400 light:text-amber-600"
                        : "text-primary/55",
                    )}
                  >
                    {task.dueLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Continue strip ───────────────────────────────────────────────────────────

function ContinueStrip({
  data,
  onOpenTask,
}: {
  data: DashboardContinue;
  onOpenTask: OpenTaskHandler;
}) {
  const projectStamp = formatRelativeStamp(data.lastProject?.updatedAt);
  const boardStamp = formatRelativeStamp(data.lastWhiteboard?.lastEditedAt);

  return (
    <section id="continue" aria-label="Continue" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Link
        href={data.lastProject ? `/projects/${data.lastProject.id}` : "/projects"}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <GlassCard className="h-full border-glass p-4 transition hover:border-accent/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <FolderKanban className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
                Last project
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-primary">
                {data.lastProject?.name ?? "Open projects"}
              </p>
              <p className="mt-0.5 text-[11px] text-primary/45">
                {data.lastProject
                  ? projectStamp
                    ? `Updated ${projectStamp}`
                    : "Pick up where you left off"
                  : "No project yet"}
              </p>
            </div>
          </div>
        </GlassCard>
      </Link>

      <Link
        href={
          data.lastWhiteboard
            ? `/whiteboard/${data.lastWhiteboard.id}`
            : "/whiteboard"
        }
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <GlassCard className="h-full border-glass p-4 transition hover:border-accent/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <PenLine className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
                Last whiteboard
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-primary">
                {data.lastWhiteboard?.title ?? "Open boards"}
              </p>
              <p className="mt-0.5 text-[11px] text-primary/45">
                {data.lastWhiteboard
                  ? boardStamp
                    ? `Edited ${boardStamp}`
                    : "Jump back into the board"
                  : "No board yet"}
              </p>
            </div>
          </div>
        </GlassCard>
      </Link>

      <GlassCard className="h-full border-glass p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <CalendarDays className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-widest text-primary/40">
              Due today
            </p>
            {data.dueToday.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {data.dueToday.map((task) => {
                  const label = (
                    <>
                      <span className="line-clamp-1 text-sm font-semibold text-primary">
                        {task.title}
                      </span>
                      {task.projectName ? (
                        <span className="block truncate text-[11px] text-primary/45">
                          {task.projectName}
                        </span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={task.id}>
                      {task.projectId ? (
                        <button
                          type="button"
                          onClick={() => onOpenTask(task.id, task.projectId as string)}
                          className="block w-full rounded-md text-left outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-primary/50">Nothing due today</p>
            )}
            <Link
              href="/timeline?filter=today"
              className="mt-2 inline-block text-[11px] font-medium text-accent/80 hover:text-accent"
            >
              Today's timeline
            </Link>
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function showApiError(
  toast: ReturnType<typeof useToast>["toast"],
  section: string,
  err: unknown,
) {
  toast({
    variant: "error",
    title: `Failed to load ${section}`,
    message:
      err instanceof ApiError ? err.message : "Please try again later.",
  });
}

const EMPTY_CONTINUE: DashboardContinue = {
  lastProject: null,
  lastWhiteboard: null,
  dueToday: [],
};

export default function DashboardPage() {
  const { toast } = useToast();
  const { updateTask, deleteTask } = useAppData();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityMap>({});
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [continueData, setContinueData] = useState<DashboardContinue | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<
    string | null
  >(null);
  const drawerContext = useTaskDrawerContext(selectedTaskProjectId);
  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    taskId: string;
    projectId: string;
    title: string;
  } | null>(null);

  const refreshDashboard = useCallback(async () => {
    try {
      const data = await getDashboardSummaryApi();
      setMetrics(data.metrics);
      setActivity(data.activity);
      setUrgentTasks(data.urgentTasks);
      setContinueData(data.continue);
    } catch (err) {
      showApiError(toast, "dashboard", err);
      setContinueData((current) => current ?? EMPTY_CONTINUE);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const openTask = useCallback(
    async (taskId: string, projectId: string) => {
      setSelectedTaskId(taskId);
      setSelectedTaskProjectId(projectId);
      setDrawerTask(null);
      setDrawerLoading(true);
      try {
        const task = await getTaskApi(taskId);
        setDrawerTask(task);
      } catch (err) {
        toast({
          variant: "error",
          title: "Could not load task",
          message: err instanceof ApiError ? err.message : "Please try again.",
        });
        setSelectedTaskId(null);
        setSelectedTaskProjectId(null);
      } finally {
        setDrawerLoading(false);
      }
    },
    [toast],
  );

  const handleSaveTask = async (updated: Task) => {
    if (!selectedTaskProjectId) return;
    try {
      const saved = await updateTask(selectedTaskProjectId, updated);
      setDrawerTask(saved);
      setSelectedTaskId(saved.id);
      toast({ variant: "success", title: "Task saved" });
      await refreshDashboard();
    } catch (err) {
      toast({
        variant: "error",
        title: "Save failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask(deleteTarget.projectId, deleteTarget.taskId);
      toast({ variant: "success", title: "Task deleted" });
      setSelectedTaskId(null);
      setSelectedTaskProjectId(null);
      setDrawerTask(null);
      setDeleteTarget(null);
      await refreshDashboard();
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const closeDrawer = () => {
    setSelectedTaskId(null);
    setSelectedTaskProjectId(null);
    setDrawerTask(null);
  };

  const metricCards = useMemo(() => {
    if (!metrics) return [];
    const meta = metrics._meta;
    return [
      {
        label: "Tasks Due Today",
        value: String(metrics.tasksDueToday),
        hint: meta?.totalTasks
          ? `${meta.totalTasks} assigned overall`
          : undefined,
        href: "/timeline?filter=today",
      },
      {
        label: "Active Projects",
        value: String(metrics.activeProjectsCount),
        href: "/projects",
      },
      {
        label: "Productivity Score",
        value: `${metrics.productivityPercentage}%`,
        hint:
          meta?.totalSubtasks != null && meta.completedSubtasks != null
            ? `${meta.completedSubtasks} / ${meta.totalSubtasks} subtasks`
            : undefined,
        href: "/projects",
      },
    ];
  }, [metrics]);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-primary/60">
          Your workspace overview for {dateStr}
        </p>
      </div>

      {loading ? (
        <ContinueStripSkeleton />
      ) : (
        <ContinueStrip
          data={continueData ?? EMPTY_CONTINUE}
          onOpenTask={openTask}
        />
      )}

      {loading ? (
        <MetricsCardsSkeleton />
      ) : metrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {metricCards.map(({ label, value, hint, href }) => (
            <Link
              key={label}
              href={href}
              className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <GlassCard className="h-full border-glass transition hover:border-accent/40">
                <p className="text-sm text-primary/60">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-accent">{value}</p>
                {hint ? (
                  <p className="mt-1 text-[11px] text-primary/45">{hint}</p>
                ) : null}
              </GlassCard>
            </Link>
          ))}
        </div>
      ) : null}

      <GlassCard title="Recent Activity">
        {loading ? (
          <ActivityHeatmapSkeleton />
        ) : (
          <ActivityHeatmap activity={activity} onOpenTask={openTask} />
        )}
      </GlassCard>

      <GlassCard title="Urgent Tasks">
        {loading ? (
          <UrgentTasksTableSkeleton />
        ) : (
          <UrgentTasksTable tasks={urgentTasks} onOpenTask={openTask} />
        )}
      </GlassCard>

      <SideDrawer
        isOpen={Boolean(selectedTaskId)}
        onClose={closeDrawer}
        title="Task Details"
      >
        {drawerLoading ? (
          <p className="py-8 text-center text-sm text-primary/50">
            Loading task…
          </p>
        ) : drawerTask && selectedTaskProjectId ? (
          <TaskDrawerDetails
            key={drawerTask.id}
            projectId={selectedTaskProjectId}
            task={drawerTask}
            onSave={handleSaveTask}
            onDelete={() =>
              setDeleteTarget({
                taskId: drawerTask.id,
                projectId: selectedTaskProjectId,
                title: drawerTask.title,
              })
            }
            readOnly={drawerContext.readOnly}
            projectRole={drawerContext.currentRole}
            mentionUsers={drawerContext.mentionUsers}
            canAssignTasks={drawerContext.canAssignTasks}
            assigneeOptions={drawerContext.assigneeOptions}
            canAssignSubtasks={drawerContext.canAssignSubtasks}
            subtaskAssigneeOptions={drawerContext.subtaskAssigneeOptions}
          />
        ) : null}
      </SideDrawer>

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTask}
        title="Delete task?"
        itemName={deleteTarget?.title}
      />
    </div>
  );
}
