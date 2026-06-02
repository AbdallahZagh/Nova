"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createProjectApi,
  deleteProjectApi,
  getProjectApi,
  listProjectsApi,
  updateProjectApi,
} from "@/lib/api/projects";
import {
  createSubtaskApi,
  deleteSubtaskApi,
  updateSubtaskApi,
  type SubtaskItem,
} from "@/lib/api/subtasks";
import {
  createTaskApi,
  deleteTaskApi,
  listTasksByProjectApi,
  updateTaskApi,
} from "@/lib/api/tasks";
import { sortProjectsByStatus, type Project, type ProjectFormInput } from "@/lib/projects";
import { sortTasksByStatus, type CreateTaskInput, type Task } from "@/lib/tasks";

type AppDataContextValue = {
  projects: Project[];
  projectsLoading: boolean;
  refreshProjects: () => Promise<void>;
  createProject: (input: ProjectFormInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectFormInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  getProject: (id: string) => Project | undefined;
  getTasks: (projectId: string) => Task[];
  projectDetailLoading: string | null;
  loadProjectWorkspace: (projectId: string) => Promise<void>;
  createTask: (projectId: string, input: CreateTaskInput) => Promise<Task>;
  updateTask: (projectId: string, task: Task) => Promise<Task>;
  deleteTask: (projectId: string, taskId: string) => Promise<void>;
  createSubtask: (
    projectId: string,
    taskId: string,
    title: string,
  ) => Promise<SubtaskItem>;
  updateSubtask: (
    projectId: string,
    taskId: string,
    subtaskId: string,
    patch: { label?: string; done?: boolean },
  ) => Promise<SubtaskItem>;
  deleteSubtask: (
    projectId: string,
    taskId: string,
    subtaskId: string,
  ) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [projectDetailLoading, setProjectDetailLoading] = useState<string | null>(
    null,
  );
  const [projectDetails, setProjectDetails] = useState<Record<string, Project>>(
    {},
  );

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const list = await listProjectsApi();
      setProjects(sortProjectsByStatus(list));
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const createProject = useCallback(async (input: ProjectFormInput) => {
    const created = await createProjectApi(input);
    setProjects((prev) => [...prev, created]);
    setProjectDetails((prev) => ({ ...prev, [created.id]: created }));
    return created;
  }, []);

  const updateProject = useCallback(async (id: string, input: ProjectFormInput) => {
    const updated = await updateProjectApi(id, input);
    setProjects((prev) =>
      prev.map((project) => (project.id === id ? updated : project)),
    );
    setProjectDetails((prev) => ({ ...prev, [id]: updated }));
    return updated;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await deleteProjectApi(id);
    setProjects((prev) => prev.filter((project) => project.id !== id));
    setProjectDetails((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTasksByProject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const syncProjectFromApi = useCallback(async (projectId: string) => {
    try {
      const project = await getProjectApi(projectId);
      setProjectDetails((prev) => ({ ...prev, [projectId]: project }));
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? project : p)),
      );
    } catch {
      /* keep cached project */
    }
  }, []);

  const loadProjectWorkspace = useCallback(async (projectId: string) => {
    setProjectDetailLoading(projectId);
    try {
      const [project, tasks] = await Promise.all([
        getProjectApi(projectId),
        listTasksByProjectApi(projectId),
      ]);
      setProjectDetails((prev) => ({ ...prev, [projectId]: project }));
      setProjects((prev) => {
        const exists = prev.some((p) => p.id === projectId);
        if (exists) {
          return prev.map((p) => (p.id === projectId ? project : p));
        }
        return [...prev, project];
      });
      setTasksByProject((prev) => ({
        ...prev,
        [projectId]: sortTasksByStatus(tasks),
      }));
    } catch {
      /* keep existing cached / mock data if any */
    } finally {
      setProjectDetailLoading(null);
    }
  }, []);

  const getProject = useCallback(
    (id: string) =>
      projectDetails[id] ?? projects.find((project) => project.id === id),
    [projectDetails, projects],
  );

  const getTasks = useCallback(
    (projectId: string) => tasksByProject[projectId] ?? [],
    [tasksByProject],
  );

  const createTask = useCallback(
    async (projectId: string, input: CreateTaskInput) => {
      const created = await createTaskApi(projectId, input);
    setTasksByProject((prev) => ({
      ...prev,
      [projectId]: sortTasksByStatus([...(prev[projectId] ?? []), created]),
    }));
      await syncProjectFromApi(projectId);
      return created;
    },
    [syncProjectFromApi],
  );

  const updateTask = useCallback(
    async (projectId: string, updated: Task) => {
      const saved = await updateTaskApi(updated);
    setTasksByProject((prev) => ({
      ...prev,
      [projectId]: sortTasksByStatus(
        (prev[projectId] ?? []).map((task) =>
          task.id === saved.id ? saved : task,
        ),
      ),
    }));
      await syncProjectFromApi(projectId);
      return saved;
    },
    [syncProjectFromApi],
  );

  const deleteTask = useCallback(
    async (projectId: string, taskId: string) => {
      await deleteTaskApi(taskId);
      setTasksByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).filter((task) => task.id !== taskId),
      }));
      await syncProjectFromApi(projectId);
    },
    [syncProjectFromApi],
  );

  const patchTaskSubtasks = useCallback(
    (
      projectId: string,
      taskId: string,
      updater: (subtasks: SubtaskItem[]) => SubtaskItem[],
    ) => {
      setTasksByProject((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map((task) =>
          task.id === taskId
            ? { ...task, subtasks: updater(task.subtasks) }
            : task,
        ),
      }));
    },
    [],
  );

  const createSubtask = useCallback(
    async (projectId: string, taskId: string, title: string) => {
      const created = await createSubtaskApi(taskId, title);
      patchTaskSubtasks(projectId, taskId, (list) => [...list, created]);
      await syncProjectFromApi(projectId);
      return created;
    },
    [patchTaskSubtasks, syncProjectFromApi],
  );

  const updateSubtask = useCallback(
    async (
      projectId: string,
      taskId: string,
      subtaskId: string,
      patch: { label?: string; done?: boolean },
    ) => {
      const apiPatch: { title?: string; isCompleted?: boolean } = {};
      if (patch.label !== undefined) apiPatch.title = patch.label;
      if (patch.done !== undefined) apiPatch.isCompleted = patch.done;
      const saved = await updateSubtaskApi(subtaskId, apiPatch);
      patchTaskSubtasks(projectId, taskId, (list) =>
        list.map((s) => (s.id === subtaskId ? saved : s)),
      );
      await syncProjectFromApi(projectId);
      return saved;
    },
    [patchTaskSubtasks, syncProjectFromApi],
  );

  const deleteSubtask = useCallback(
    async (projectId: string, taskId: string, subtaskId: string) => {
      await deleteSubtaskApi(subtaskId);
      patchTaskSubtasks(projectId, taskId, (list) =>
        list.filter((s) => s.id !== subtaskId),
      );
      await syncProjectFromApi(projectId);
    },
    [patchTaskSubtasks, syncProjectFromApi],
  );

  const value = useMemo(
    () => ({
      projects,
      projectsLoading,
      refreshProjects,
      createProject,
      updateProject,
      deleteProject,
      getProject,
      getTasks,
      projectDetailLoading,
      loadProjectWorkspace,
      createTask,
      updateTask,
      deleteTask,
      createSubtask,
      updateSubtask,
      deleteSubtask,
    }),
    [
      projects,
      projectsLoading,
      refreshProjects,
      createProject,
      updateProject,
      deleteProject,
      getProject,
      getTasks,
      projectDetailLoading,
      loadProjectWorkspace,
      createTask,
      updateTask,
      deleteTask,
      createSubtask,
      updateSubtask,
      deleteSubtask,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return context;
}
