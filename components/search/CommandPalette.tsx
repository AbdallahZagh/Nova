"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  FolderKanban,
  Loader2,
  PenLine,
  Search,
  UserRound,
} from "lucide-react";
import {
  searchApi,
  type SearchProject,
  type SearchTask,
  type SearchUser,
  type SearchWhiteboard,
} from "@/lib/api/search";
import { cn } from "@/lib/cn";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ResultItem =
  | {
      id: string;
      type: "project";
      label: string;
      subtitle?: string;
      href: string;
      item: SearchProject;
    }
  | {
      id: string;
      type: "task";
      label: string;
      subtitle?: string;
      href: string;
      item: SearchTask;
    }
  | {
      id: string;
      type: "user";
      label: string;
      subtitle?: string;
      href: string;
      item: SearchUser;
    }
  | {
      id: string;
      type: "whiteboard";
      label: string;
      subtitle?: string;
      href: string;
      item: SearchWhiteboard;
    };

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function userName(user: SearchUser) {
  return user.name ?? user.fullName ?? user.email ?? "Unknown user";
}

function userSubtitle(user: SearchUser) {
  return user.username ?? user.email ?? "";
}

function taskProjectId(task: SearchTask) {
  return task.projectId ?? task.project?.id ?? "";
}

function flattenResults(
  projects: SearchProject[],
  whiteboards: SearchWhiteboard[],
  tasks: SearchTask[],
  users: SearchUser[],
): ResultItem[] {
  return [
    ...projects.map((project) => ({
      id: `project-${project.id}`,
      type: "project" as const,
      label: project.name,
      subtitle: project.description ?? project.status,
      href: `/projects/${project.id}`,
      item: project,
    })),
    ...whiteboards.map((board) => ({
      id: `whiteboard-${board.id}`,
      type: "whiteboard" as const,
      label: board.title,
      subtitle: board.project?.name ?? "Personal whiteboard",
      href: `/whiteboard/${board.id}`,
      item: board,
    })),
    ...tasks.map((task) => {
      const projectId = taskProjectId(task);
      return {
        id: `task-${task.id}`,
        type: "task" as const,
        label: task.title,
        subtitle: task.project?.name ?? "Task",
        href: projectId ? `/projects/${projectId}?task=${task.id}` : "/projects",
        item: task,
      };
    }),
    ...users.map((user) => ({
      id: `user-${user.id}`,
      type: "user" as const,
      label: userName(user),
      subtitle: userSubtitle(user),
      href: `/users/${user.id}`,
      item: user,
    })),
  ];
}

function ResultIcon({ type }: { type: ResultItem["type"] }) {
  const Icon =
    type === "project"
      ? FolderKanban
      : type === "whiteboard"
        ? PenLine
        : type === "task"
          ? CheckSquare
          : UserRound;

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-glass bg-glass-button text-accent">
      <Icon className="size-4" />
    </span>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [projects, setProjects] = useState<SearchProject[]>([]);
  const [whiteboards, setWhiteboards] = useState<SearchWhiteboard[]>([]);
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo(
    () => flattenResults(projects, whiteboards, tasks, users),
    [projects, whiteboards, tasks, users],
  );
  const hasQuery = debouncedQuery.trim().length > 0;
  const hasResults = items.length > 0;
  const activeItem = items[Math.min(activeIndex, Math.max(items.length - 1, 0))];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const q = debouncedQuery.trim();
    if (!q) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- request state mirrors the debounced API call
    setLoading(true);
    searchApi(q, controller.signal)
      .then((results) => {
        setProjects(results.projects);
        setWhiteboards(results.whiteboards);
        setTasks(results.tasks);
        setUsers(results.users);
        setActiveIndex(0);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProjects([]);
        setWhiteboards([]);
        setTasks([]);
        setUsers([]);
        setActiveIndex(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, open]);

  const clearResults = () => {
    setProjects([]);
    setWhiteboards([]);
    setTasks([]);
    setUsers([]);
    setActiveIndex(0);
    setLoading(false);
  };

  const close = () => {
    onOpenChange(false);
    setQuery("");
    clearResults();
  };

  const goTo = (href: string) => {
    close();
    router.push(href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (items.length ? (index + 1) % items.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        items.length ? (index - 1 + items.length) % items.length : 0,
      );
      return;
    }
    if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      goTo(activeItem.href);
    }
  };

  const renderSection = (
    title: string,
    sectionItems: ResultItem[],
    startIndex: number,
  ) => {
    if (sectionItems.length === 0) return null;

    return (
      <section className="py-1.5">
        <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-primary/45">
          {title}
        </h3>
        <div role="group" aria-label={title} className="space-y-1">
          {sectionItems.map((item, offset) => {
            const index = startIndex + offset;
            const active = activeIndex === index;

            return (
              <button
                key={item.id}
                id={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => goTo(item.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  active
                    ? "border-accent/40 bg-accent/10 text-primary shadow-sm shadow-accent/10"
                    : "border-transparent text-primary/80 hover:border-glass hover:bg-glass-button hover:text-primary",
                )}
              >
                <ResultIcon type={item.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.label}
                  </span>
                  {item.subtitle ? (
                    <span className="mt-0.5 block truncate text-xs text-primary/45">
                      {item.subtitle}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const { projectItems, whiteboardItems, taskItems, userItems } = useMemo(() => {
    const projectItems: ResultItem[] = [];
    const whiteboardItems: ResultItem[] = [];
    const taskItems: ResultItem[] = [];
    const userItems: ResultItem[] = [];
    for (const item of items) {
      if (item.type === "project") projectItems.push(item);
      else if (item.type === "whiteboard") whiteboardItems.push(item);
      else if (item.type === "task") taskItems.push(item);
      else userItems.push(item);
    }
    return { projectItems, whiteboardItems, taskItems, userItems };
  }, [items]);

  return (
    <div ref={rootRef} className="relative z-40 max-w-xl flex-1">
      <div
        className={cn(
          "relative flex h-10 items-center rounded-xl border bg-glass-button/70 text-sm transition",
          open
            ? "border-accent/45 bg-glass-card shadow-lg shadow-accent/5"
            : "border-glass hover:border-accent/35 hover:bg-glass-button",
        )}
      >
        <Search className="pointer-events-none absolute left-3 size-4 text-primary/55" />
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setActiveIndex(0);
              if (!value.trim()) clearResults();
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded={open && hasResults}
            aria-controls="command-palette-results"
            aria-activedescendant={activeItem?.id}
            placeholder="Search tasks, projects, whiteboards, users..."
            className="h-full w-full bg-transparent pl-10 pr-16 text-primary outline-none placeholder:text-primary/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="flex h-full w-full items-center pl-10 pr-16 text-left text-primary/45"
          >
            <span className="truncate">Search tasks, projects, whiteboards, users...</span>
          </button>
        )}
        {loading ? (
          <Loader2 className="absolute right-4 size-4 animate-spin text-accent" />
        ) : (
          <kbd className="absolute right-3 hidden rounded-md border border-glass bg-sidebar px-1.5 py-0.5 text-[10px] font-semibold text-primary/45 sm:block">
            {open ? "Esc" : "Cmd K"}
          </kbd>
        )}
      </div>

      {open ? (
        <div
          id="command-palette-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(420px,calc(100dvh-5.5rem))] overflow-y-auto rounded-2xl border border-glass bg-sidebar p-2 shadow-2xl shadow-black/20 backdrop-blur-xl light:shadow-primary/10"
        >
          {!hasQuery ? (
            <div className="px-3 py-8 text-center text-sm text-primary/45">
              Start typing to search across your workspace.
            </div>
          ) : loading && !hasResults ? (
            <div className="px-3 py-8 text-center text-sm text-primary/45">
              Searching...
            </div>
          ) : !hasResults ? (
            <div className="px-3 py-8 text-center text-sm text-primary/45">
              No results found.
            </div>
          ) : (
            <>
              {renderSection("Projects", projectItems, 0)}
              {renderSection(
                "Whiteboards",
                whiteboardItems,
                projectItems.length,
              )}
              {renderSection(
                "Tasks",
                taskItems,
                projectItems.length + whiteboardItems.length,
              )}
              {renderSection(
                "Users",
                userItems,
                projectItems.length + whiteboardItems.length + taskItems.length,
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
