"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectsSkeleton } from "@/components/skeletons/ProjectsSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useUser } from "@/components/providers/UserProvider";
import { ApiError } from "@/lib/api/client";
import {
  matchesOwnershipFilter,
  PROJECT_STATUS_OPTIONS,
  sortProjectsByStatus,
  type Project,
  type ProjectFormInput,
  type ProjectOwnershipFilter,
  type ProjectStatus,
} from "@/lib/projects";
import {
  canDeleteProject,
  canEditProjectDetails,
  getProjectMemberRole,
} from "@/lib/useProjectRole";

type FilterStatus = "All" | ProjectStatus;

const OWNERSHIP_OPTIONS = [
  { value: "All", label: "All", description: "Every project you can see" },
  { value: "Mine", label: "Mine", description: "You own it" },
  { value: "Shared", label: "Shared", description: "You’re on the team" },
];

const STATUS_OPTIONS = [
  { value: "All", label: "All statuses" },
  ...PROJECT_STATUS_OPTIONS,
];

export default function ProjectsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { profile } = useUser();
  const {
    projects,
    projectsLoading,
    createProject,
    updateProject,
    deleteProject,
  } = useAppData();

  const [activeFilter, setActiveFilter] = useState<FilterStatus>("All");
  const [ownershipFilter, setOwnershipFilter] =
    useState<ProjectOwnershipFilter>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredProjects = useMemo(() => {
    const list = projects.filter((project) => {
      const matchesStatus =
        activeFilter === "All" || project.status === activeFilter;
      return (
        matchesStatus &&
        matchesOwnershipFilter(project, ownershipFilter, profile?.id)
      );
    });
    return sortProjectsByStatus(list);
  }, [activeFilter, ownershipFilter, profile?.id, projects]);

  const canCreateProjects = useMemo(() => {
    if (profile?.isDemo) return false;
    if (projects.length === 0) return true;
    return projects.some((project) =>
      canEditProjectDetails(getProjectMemberRole(project, profile?.id)),
    );
  }, [profile?.id, profile?.isDemo, projects]);

  const openCreateModal = () => {
    if (!canCreateProjects) return;
    setModalMode("create");
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    if (!canEditProjectDetails(getProjectMemberRole(project, profile?.id))) return;
    setModalMode("edit");
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleSubmit = async (input: ProjectFormInput) => {
    if (modalMode === "create" && !canCreateProjects) return;
    if (
      modalMode === "edit" &&
      editingProject &&
      !canEditProjectDetails(getProjectMemberRole(editingProject, profile?.id))
    ) {
      return;
    }
    setSubmitting(true);
    try {
      if (modalMode === "edit" && editingProject) {
        await updateProject(editingProject.id, input);
        toast({
          variant: "success",
          title: "Project updated",
          message: `"${input.title}" was saved successfully.`,
        });
        setIsModalOpen(false);
      } else {
        const created = await createProject(input);
        toast({
          variant: "success",
          title: "Project created",
          message: `"${input.title}" is ready to use.`,
        });
        setIsModalOpen(false);
        router.push(`/projects/${created.id}?newTask=1`);
      }
    } catch (err) {
      toast({
        variant: "error",
        title: modalMode === "edit" ? "Update failed" : "Create failed",
        message:
          err instanceof ApiError
            ? err.message
            : "Could not save the project. Please try again.",
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      toast({
        variant: "success",
        title: "Project deleted",
        message: `"${deleteTarget.title}" was removed.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        variant: "error",
        title: "Delete failed",
        message:
          err instanceof ApiError
            ? err.message
            : "Could not delete the project. You may not have permission.",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (projectsLoading) {
    return <ProjectsSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4"> 
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Projects
          </h1>
          <p className="mt-1 text-sm text-primary/60">
            Manage and track your active projects.
          </p>
        </div>
        {canCreateProjects && (
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-4 py-2.5 text-sm font-semibold text-primary transition hover:opacity-90"
          >
            New Project
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full min-w-[180px] sm:w-56">
          <label
            htmlFor="project-ownership-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Ownership
          </label>
          <Select
            id="project-ownership-filter"
            value={ownershipFilter}
            onChange={(value) =>
              setOwnershipFilter(value as ProjectOwnershipFilter)
            }
            options={OWNERSHIP_OPTIONS}
            aria-label="Filter by ownership"
          />
        </div>
        <div className="w-full min-w-[180px] sm:w-56">
          <label
            htmlFor="project-status-filter"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Status
          </label>
          <Select
            id="project-status-filter"
            value={activeFilter}
            onChange={(value) => setActiveFilter(value as FilterStatus)}
            options={STATUS_OPTIONS}
            aria-label="Filter by status"
          />
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-2xl border border-glass bg-glass-card p-10 text-center">
          <p className="text-sm text-primary/60">No projects found.</p>
          {canCreateProjects && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 text-sm font-medium text-accent hover:underline"
            >
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const role = getProjectMemberRole(project, profile?.id);
            return (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={openEditModal}
                onDelete={setDeleteTarget}
                canEdit={canEditProjectDetails(role)}
                canDelete={!profile?.isDemo && canDeleteProject(role)}
              />
            );
          })}
        </div>
      )}

      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => !submitting && setIsModalOpen(false)}
        mode={modalMode}
        project={editingProject}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete project?"
        message="This permanently removes the project and all its tasks. Only the project owner can delete."
        itemName={deleteTarget?.title}
        confirmLabel={deleting ? "Deleting…" : "Delete project"}
      />
    </div>
  );
}
