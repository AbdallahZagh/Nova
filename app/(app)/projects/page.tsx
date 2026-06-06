"use client";

import { useMemo, useState } from "react";
import { ProjectsSkeleton } from "@/components/skeletons/ProjectsSkeleton";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { useToast } from "@/components/ui/Toast";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useUser } from "@/components/providers/UserProvider";
import { ApiError } from "@/lib/api/client";
import {
  projectStatusLabel,
  sortProjectsByStatus,
  type Project,
  type ProjectFormInput,
  type ProjectStatus,
} from "@/lib/projects";
import { canDeleteProject, getProjectMemberRole } from "@/lib/useProjectRole";

type FilterStatus = "All" | ProjectStatus;

export default function ProjectsPage() {
  const { toast } = useToast();
  const { profile } = useUser();
  const {
    projects,
    projectsLoading,
    createProject,
    updateProject,
    deleteProject,
  } = useAppData();

  const [activeFilter, setActiveFilter] = useState<FilterStatus>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredProjects = useMemo(() => {
    const list =
      activeFilter === "All"
        ? projects
        : projects.filter((project) => project.status === activeFilter);
    return sortProjectsByStatus(list);
  }, [activeFilter, projects]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setModalMode("edit");
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleSubmit = async (input: ProjectFormInput) => {
    setSubmitting(true);
    try {
      if (modalMode === "edit" && editingProject) {
        await updateProject(editingProject.id, input);
        toast({
          variant: "success",
          title: "Project updated",
          message: `"${input.title}" was saved successfully.`,
        });
      } else {
        await createProject(input);
        toast({
          variant: "success",
          title: "Project created",
          message: `"${input.title}" is ready to use.`,
        });
      }
      setIsModalOpen(false);
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
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-4 py-2.5 text-sm font-semibold text-primary transition hover:opacity-90"
        >
          New Project
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/35 bg-glass-card p-3">
          {(
            ["All", "Active", "In Progress", "Completed", "Archived"] as FilterStatus[]
          ).map(
            (chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setActiveFilter(chip)}
                className={
                  activeFilter === chip
                    ? "rounded-full border border-accent/60 bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent transition"
                    : "rounded-full border border-accent/35 bg-glass-button px-3 py-1.5 text-xs font-medium text-primary/80 transition hover:border-accent/40 hover:text-accent"
                }
              >
                {chip === "All" ? chip : projectStatusLabel(chip)}
              </button>
            ),
          )}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-2xl border border-glass bg-glass-card p-10 text-center">
          <p className="text-sm text-primary/60">No projects found.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={openEditModal}
              onDelete={setDeleteTarget}
              canDelete={canDeleteProject(
                getProjectMemberRole(project, profile?.id),
              )}
            />
          ))}
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
