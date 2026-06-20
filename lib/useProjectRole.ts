"use client";

import { useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import type { Project, ProjectMemberRole } from "@/lib/projects";

export function getProjectMemberRole(
  project: Project | undefined,
  userId: string | undefined | null,
): ProjectMemberRole | null {
  if (!project || !userId) return null;
  if (project.ownerId === userId) return "OWNER";
  return (
    project.teamMembers.find((member) => member.userId === userId || member.id === userId)
      ?.role ?? null
  );
}

export function canManageProjectTeam(role: ProjectMemberRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

export function canDeleteProject(role: ProjectMemberRole | null) {
  return role === "OWNER";
}

export function canEditProjectDetails(role: ProjectMemberRole | null) {
  return role !== null && role !== "VIEWER";
}

export function canEditProjectTasks(role: ProjectMemberRole | null) {
  return role !== null && role !== "VIEWER";
}

export function canAssignProjectTasks(role: ProjectMemberRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

export function useProjectRole(projectId: string, userId: string | undefined | null) {
  const { getProject } = useAppData();
  const project = getProject(projectId);

  return useMemo(
    () => getProjectMemberRole(project, userId),
    [project, userId],
  );
}
