"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, GanttChart } from "lucide-react";
import {
  TimelineBoardSkeleton,
  TimelineSkeleton,
} from "@/components/skeletons/TimelineSkeleton";
import { CalendarBoard } from "@/components/timeline/CalendarBoard";
import { GanttBoard } from "@/components/timeline/GanttBoard";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Select } from "@/components/ui/Select";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { TaskDrawerDetails } from "@/components/tasks/TaskDrawerDetails";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import {
  getTimelineApi,
  type TimelineFilter,
  type TimelineSubscription,
  type TimelineTask,
} from "@/lib/api/timeline";
import { getTaskApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Task, TaskStatus } from "@/lib/tasks";
import {
  type BoardView,
  TIME_FILTER_OPTIONS,
  STATUS_DOT,
  calendarWindow,
  parseTimelineFilter,
} from "@/lib/timeline/layout";
import { useTaskDrawerContext } from "@/lib/useTaskDrawerContext";

function TimelinePage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects, projectsLoading, updateTask, deleteTask } = useAppData();

  const [view, setView] = useState<BoardView>(
    () => (searchParams.get("view") === "gantt" ? "gantt" : "calendar"),
  );
  const [timeFilter, setTimeFilter] = useState<TimelineFilter>(
    () => parseTimelineFilter(searchParams.get("filter")) ?? "monthly",
  );
  const [filterProjectId, setFilterProjectId] = useState("all");
  const [source, setSource] = useState<"all" | "tasks" | "subscriptions">("all");
  const [timelineItems, setTimelineItems] = useState<TimelineTask[]>([]);
  const [charges, setCharges] = useState<TimelineSubscription[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const requestId = useRef(0);

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

  const loadTimeline = useCallback(async () => {
    const id = ++requestId.current;
    setTimelineLoading(true);
    try {
      const data = await getTimelineApi({
        filter: timeFilter,
        ...(filterProjectId !== "all" ? { projectId: filterProjectId } : {}),
      });
      if (id !== requestId.current) return;
      setTimelineItems(data.items);
      setCharges(data.subscriptions);
    } catch (err) {
      if (id !== requestId.current) return;
      setTimelineItems([]);
      setCharges([]);
      toast({
        variant: "error",
        title: "Could not load timeline",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      if (id !== requestId.current) return;
      setTimelineLoading(false);
      setReady(true);
    }
  }, [timeFilter, filterProjectId, toast]);

  useEffect(() => {
    if (!projectsLoading) loadTimeline();
  }, [projectsLoading, loadTimeline]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.title })),
    ],
    [projects],
  );

  const { start: rangeStart, end: rangeEnd } = calendarWindow(timeFilter);
  const selectedWindow =
    TIME_FILTER_OPTIONS.find((option) => option.value === timeFilter)?.label ??
    "Timeline";
  const windowLabel = timelineLoading
    ? selectedWindow
    : (timelineItems[0]?.windowLabel ?? selectedWindow);

  function selectTimeFilter(value: TimelineFilter) {
    if (value === timeFilter) return;
    setTimelineLoading(true);
    setTimeFilter(value);
  }

  function selectProject(value: string) {
    if (value === filterProjectId) return;
    setTimelineLoading(true);
    setFilterProjectId(value);
  }

  const openTask = useCallback(
    async (item: TimelineTask) => {
      setSelectedTaskId(item.id);
      setSelectedTaskProjectId(item.project.id);
      setDrawerTask(null);
      setDrawerLoading(true);
      try {
        const task = await getTaskApi(item.id);
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
      await loadTimeline();
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
      await loadTimeline();
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const visibleTasks = source === "subscriptions" ? [] : timelineItems;
  const visibleCharges = source === "tasks" ? [] : charges;
  if (!ready && (projectsLoading || timelineLoading)) return <TimelineSkeleton />;

  const rangeCaption = `${rangeStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${rangeEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col gap-4 p-6 md:-m-8 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-primary/55">
            {timelineLoading
              ? `Loading ${selectedWindow.toLowerCase()}…`
              : `${windowLabel} · ${rangeCaption} · ${timelineItems.length} task${timelineItems.length === 1 ? "" : "s"}${charges.length > 0 ? ` · ${charges.length} charge${charges.length === 1 ? "" : "s"}` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-glass bg-glass-button/50 p-1">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "calendar"
                ? "bg-accent text-white shadow-sm"
                : "text-primary/60 hover:text-primary",
            )}
          >
            <CalendarDays className="size-3.5" />
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setView("gantt")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "gantt"
                ? "bg-accent text-white shadow-sm"
                : "text-primary/60 hover:text-primary",
            )}
          >
            <GanttChart className="size-3.5" />
            Gantt
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-glass bg-sidebar shadow-sm">
        <div className="flex shrink-0 flex-col gap-3 border-b border-glass px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-glass bg-glass-button/50 p-1">
            {TIME_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectTimeFilter(option.value)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  timeFilter === option.value
                    ? "bg-accent text-white shadow-sm"
                    : "text-primary/60 hover:bg-glass-button hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={filterProjectId}
              onChange={selectProject}
              options={projectOptions}
              variant="glass"
              aria-label="Filter by project"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-glass px-4 py-2">
          <div className="flex gap-1 rounded-xl border border-glass bg-glass-button/50 p-1">
            {(
              [
                { value: "all", label: "All" },
                { value: "tasks", label: "Tasks" },
                { value: "subscriptions", label: "Subscriptions" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSource(option.value)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition",
                  source === option.value
                    ? "bg-accent text-white"
                    : "text-primary/60 hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {(["To Do", "In Progress", "In Review", "Completed"] as TaskStatus[]).map(
            (s) => (
              <div
                key={s}
                className="flex items-center gap-1.5 text-[11px] text-primary/65"
              >
                <div className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                {s}
              </div>
            ),
            )}
          <div className="flex items-center gap-1.5 text-[11px] text-sky-300 light:text-sky-700">
            <span className="size-2 rotate-45 bg-sky-400 light:bg-sky-600" />
            Subscription
          </div>
          <p className="w-full text-[11px] text-primary/40 sm:ml-auto sm:w-auto">
            {view === "calendar"
              ? "Hover a day to preview. Click one task to open it, or click a busy day to pick from the list."
              : "Bars run from created date to due date. Hover a short bar to see the title."}
          </p>
        </div>

        {timelineLoading ? (
          <TimelineBoardSkeleton />
        ) : view === "calendar" ? (
          <CalendarBoard
            items={visibleTasks}
            charges={visibleCharges}
            filter={timeFilter}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onOpen={openTask}
            onOpenCharge={(charge) => router.push(`/subscriptions?id=${charge.id}`)}
          />
        ) : (
          <GanttBoard
            items={visibleTasks}
            charges={visibleCharges}
            filter={timeFilter}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            projects={projects}
            filterProjectId={filterProjectId}
            onOpen={openTask}
            onOpenCharge={(id) => router.push(`/subscriptions?id=${id}`)}
          />
        )}
      </div>

      <SideDrawer
        isOpen={Boolean(selectedTaskId)}
        onClose={() => {
          setSelectedTaskId(null);
          setSelectedTaskProjectId(null);
          setDrawerTask(null);
        }}
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

export default function TimelinePageRoute() {
  return (
    <Suspense fallback={<TimelineSkeleton />}>
      <TimelinePage />
    </Suspense>
  );
}
