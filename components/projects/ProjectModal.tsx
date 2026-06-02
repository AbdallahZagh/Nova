"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import {
  PROJECT_CONTRIBUTORS,
  PROJECT_STATUS_OPTIONS,
  type Project,
  type ProjectFormInput,
  type ProjectStatus,
} from "@/lib/projects";

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

type ProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  project?: Project | null;
  onSubmit: (input: ProjectFormInput) => void | Promise<void>;
  submitting?: boolean;
};

function ProjectForm({
  mode,
  project,
  onClose,
  onSubmit,
  submitting = false,
}: {
  mode: "create" | "edit";
  project?: Project | null;
  onClose: () => void;
  onSubmit: (input: ProjectFormInput) => void | Promise<void>;
  submitting?: boolean;
}) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Active");
  const [contributorIds, setContributorIds] = useState<string[]>(
    project?.contributorIds ?? [],
  );

  const isEdit = mode === "edit";

  return (
    <div className="relative overflow-visible rounded-2xl border border-glass bg-sidebar px-6 py-4 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2
            id="project-modal-title"
            className="text-xl font-semibold tracking-tight text-primary"
          >
            {isEdit ? "Edit Project" : "Create New Project"}
          </h2>
          <p className="mt-0.5 text-sm text-primary/75">
            {isEdit
              ? "Update project details and team."
              : "Set up a new workspace to organize your tasks."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-full text-primary/75 transition-all hover:text-accent"
        >
          <X className="size-6" />
        </button>
      </div>

      <div className="mt-6 h-0.5 w-full bg-linear-90 from-transparent via-accent to-transparent" />

      <form
        className="mt-6 space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim() || submitting) return;
          try {
            await onSubmit({
              title: title.trim(),
              description: description.trim(),
              status,
              contributorIds,
            });
            onClose();
          } catch {
            /* parent shows toast; keep modal open */
          }
        }}
      >
        <div>
          <label
            htmlFor="project-name"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Project Name
          </label>
          <Input
            id="project-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            type="text"
            required
            placeholder="e.g. Elegance Hub Redesign"
          />
        </div>

        <div>
          <label
            htmlFor="project-description"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Description
          </label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Briefly describe the goals of this project..."
            className="resize-none"
          />
        </div>

        <div>
          <label
            htmlFor="project-status"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Status
          </label>
          <Select
            id="project-status"
            value={status}
            onChange={(value) => setStatus(value as ProjectStatus)}
            options={PROJECT_STATUS_OPTIONS}
            aria-label="Project status"
          />
        </div>

        <div>
          <label
            htmlFor="project-contributors"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Team Members
          </label>
          <MultiSelect
            id="project-contributors"
            value={contributorIds}
            onChange={setContributorIds}
            options={PROJECT_CONTRIBUTORS}
            placeholder="Select contributors..."
            variant="glass"
            aria-label="Team members"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-glass-button disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-linear-90 from-accent/75 to-accent/35 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/75 disabled:opacity-50"
          >
            {submitting
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save Changes"
                : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProjectModal({
  isOpen,
  onClose,
  mode,
  project,
  onSubmit,
  submitting = false,
}: ProjectModalProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-120 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
        <ProjectForm
          key={project?.id ?? "create"}
          mode={mode}
          project={project}
          onClose={onClose}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      </div>
    </div>,
    document.body,
  );
}
