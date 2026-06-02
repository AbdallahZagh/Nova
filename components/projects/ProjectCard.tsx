"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";
import { cn } from "@/lib/cn";
import { projectStatusLabel, type Project } from "@/lib/projects";

export type { Project } from "@/lib/projects";

const statusStyles: Record<Project["status"], string> = {
  Active: "border-accent/50 text-accent",
  "In Progress": "border-warning/50 text-warning",
  Completed: "border-success/50 text-success",
  Archived: "border-primary/30 text-primary/55",
};

type ProjectCardProps = {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
};

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const progress = Math.max(0, Math.min(100, project.progress));

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    triggerRef,
    menuOpen,
    90,
    { minWidth: 160 },
  );

  const close = useCallback(() => setMenuOpen(false), []);
  useFloatingClickOutside(menuOpen, close, triggerRef, menuRef);

  const toggleMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!menuOpen) precomputeStyle();
    setMenuOpen((open) => !open);
  };

  return (
    <div className="relative h-full">
      <Link href={`/projects/${project.id}`} className="block h-full">
        <GlassCard
          className={cn(
            "flex h-full flex-col border-glass transition duration-200 ease-out",
            "hover:scale-[1.02] hover:border-accent/40",
          )}
        >
          <div className="flex items-start justify-between gap-3 pr-10">
            <h3 className="text-base font-semibold leading-snug text-primary">
              {project.title}
            </h3>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                statusStyles[project.status],
              )}
            >
              {projectStatusLabel(project.status)}
            </span>
          </div>

          {/* flex-1 so description fills space, pushing footer to bottom */}
          <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-primary/70">
            {project.description}
          </p>

          <div className="mt-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-medium text-primary/70">
                  {progress}% complete
                </span>
                {project.totalTasks != null && (
                  <p className="text-[11px] text-primary/50">
                    {project.completedTasks ?? 0}/{project.totalTasks} tasks
                    {project.totalSubtasks != null && project.totalSubtasks > 0
                      ? ` · ${project.completedSubtasks ?? 0}/${project.totalSubtasks} subtasks`
                      : ""}
                  </p>
                )}
              </div>

              <div className="flex items-center">
                {project.teamMembers.map((member, index) => (
                  <div key={`${member.initials}-${index}`} className="-ml-1 first:ml-0">
                    <div className="flex size-7 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-glass-button text-[10px] font-semibold text-primary">
                      {member.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.imageUrl}
                          alt={member.initials}
                          className="size-full object-cover"
                        />
                      ) : (
                        member.initials
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </Link>

      {/* Three-dot action button — always visible, outside the Link */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={toggleMenu}
        className={cn(
          "absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-lg border border-glass bg-glass-button text-primary/60 transition hover:border-accent/40 hover:text-accent",
          menuOpen && "border-accent/40 text-accent",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      <FloatingMenuPortal
        isOpen={menuOpen}
        triggerRef={triggerRef}
        menuRef={menuRef}
        style={style}
        role="menu"
        className="overflow-hidden rounded-xl border border-glass bg-sidebar p-1 shadow-xl shadow-black/40 backdrop-blur-2xl"
      >
        <button
          type="button"
          role="menuitem"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(false);
            onEdit(project);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition hover:bg-accent/10 hover:text-accent"
        >
          <Pencil className="size-3.5 shrink-0" />
          Edit project
        </button>
        <div className="my-1 h-px bg-glass-border" />
        <button
          type="button"
          role="menuitem"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(false);
            onDelete(project);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-400 light:text-red-600 transition hover:bg-red-500/10"
        >
          <Trash2 className="size-3.5 shrink-0" />
          Delete project
        </button>
      </FloatingMenuPortal>
    </div>
  );
}
