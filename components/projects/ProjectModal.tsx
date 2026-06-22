"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  ProjectMemberPicker,
  type SelectedProjectMember,
} from "@/components/projects/ProjectMemberPicker";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
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

type AiProjectDescriptionResponse = {
  description: string;
};

const aiFilledFieldClass =
  "border-accent/60 bg-accent/10 ring-1 ring-accent/25 shadow-[0_0_0_1px_rgba(197,96,16,0.08)]";

function AiDraftBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      AI draft
    </span>
  );
}

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
  const { toast } = useToast();
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "Active");
  const [contributorIds, setContributorIds] = useState<string[]>(
    project?.contributorIds ?? [],
  );
  const [selectedMembers, setSelectedMembers] = useState<SelectedProjectMember[]>([]);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isAiDescription, setIsAiDescription] = useState(false);

  const isEdit = mode === "edit";

  const handleAiDescription = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isGeneratingDescription) {
      if (!trimmedTitle) {
        toast({
          variant: "warning",
          title: "Add a project name first",
          message: "The AI needs a project name before it can write a description.",
        });
      }
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const suggestion = await apiFetch<AiProjectDescriptionResponse>(
        "/api/projects/ai-description",
        {
          method: "POST",
          body: JSON.stringify({ title: trimmedTitle }),
        },
      );
      setDescription(suggestion.description ?? "");
      setIsAiDescription(true);
      toast({
        variant: "success",
        title: "Description generated",
        message: "Review the AI suggestion before saving the project.",
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "AI description failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not generate a project description. Please try again.",
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

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
              ? "Update project details."
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
              members: selectedMembers.map((member) => ({
                userId: member.user.id,
                role: member.role,
              })),
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
          <button
            type="button"
            onClick={handleAiDescription}
            disabled={isGeneratingDescription || !title.trim()}
            aria-label="Generate project description with AI"
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-glass bg-glass-button/60 px-3 py-2 text-left transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/20">
                <Sparkles
                  className={cn(
                    "size-4",
                    isGeneratingDescription && "animate-pulse",
                  )}
                />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-primary">
                  {isGeneratingDescription
                    ? "Writing project description"
                    : "Generate with AI"}
                </span>
                <span className="block truncate text-[11px] text-primary/55">
                  Create a concise description from the project name.
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-accent/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              AI
            </span>
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor="project-description"
              className="block text-xs font-semibold uppercase tracking-wider text-primary/75"
            >
              Description
            </label>
            <AiDraftBadge visible={isAiDescription} />
          </div>
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsAiDescription(false);
            }}
            rows={4}
            placeholder="Briefly describe the goals of this project..."
            className={cn("resize-none transition", isAiDescription && aiFilledFieldClass)}
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

        {!isEdit && (
          <div>
          <label
            htmlFor="project-contributors"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-primary/75"
          >
            Team Members
          </label>
          <ProjectMemberPicker
            value={selectedMembers}
            onChange={(members) => {
              setSelectedMembers(members);
              setContributorIds(members.map((member) => member.user.id));
            }}
          />
        </div>
        )}

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
