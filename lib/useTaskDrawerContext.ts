"use client";

import { useEffect, useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useUser } from "@/components/providers/UserProvider";
import type { SelectOption } from "@/components/ui/fieldVariants";
import { normalizeMention, type MentionUser } from "@/lib/mentions";
import {
  canAssignProjectTasks,
  canEditProjectTasks,
  getProjectMemberRole,
} from "@/lib/useProjectRole";
import type { ProjectMemberRole } from "@/lib/projects";

export function useTaskDrawerContext(projectId: string | null) {
  const { getProject, loadProjectWorkspace } = useAppData();
  const { profile } = useUser();

  useEffect(() => {
    if (!projectId) return;
    void loadProjectWorkspace(projectId);
  }, [loadProjectWorkspace, projectId]);

  const project = projectId ? getProject(projectId) : undefined;
  const currentRole = getProjectMemberRole(project, profile?.id);
  const canEditTasks = canEditProjectTasks(currentRole);
  const canAssignTasks = canAssignProjectTasks(currentRole);
  const canAssignSubtasks = canEditTasks;

  const assigneeOptions = useMemo<SelectOption[]>(
    () =>
      (project?.teamMembers ?? [])
        .filter((member) => member.role !== "VIEWER")
        .map((member) => ({
          value: member.userId ?? member.id ?? "",
          label: member.name ?? member.email ?? member.initials,
          description: member.role,
        }))
        .filter((option) => option.value),
    [project?.teamMembers],
  );

  const subtaskAssigneeOptions = useMemo(() => {
    if (canAssignTasks) return assigneeOptions;
    if (currentRole !== "MEMBER" || !profile?.id) return [];
    return assigneeOptions.filter((option) => option.value === profile.id);
  }, [assigneeOptions, canAssignTasks, currentRole, profile?.id]);

  const mentionUsers = useMemo<MentionUser[]>(() => {
    const byId = new Map<string, MentionUser>();
    if (project?.owner?.id && project.owner.username) {
      byId.set(project.owner.id, {
        id: project.owner.id,
        username: normalizeMention(project.owner.username),
        fullName: project.owner.fullName,
      });
    }
    for (const member of project?.teamMembers ?? []) {
      const id = member.userId ?? member.id ?? "";
      if (!id || !member.username) continue;
      byId.set(id, {
        id,
        username: normalizeMention(member.username),
        fullName: member.name ?? member.email ?? member.initials,
      });
    }
    return [...byId.values()];
  }, [project?.owner, project?.teamMembers]);

  return {
    currentRole: currentRole as ProjectMemberRole | null,
    canEditTasks,
    canAssignTasks,
    canAssignSubtasks,
    assigneeOptions,
    subtaskAssigneeOptions,
    mentionUsers,
    readOnly: !canEditTasks,
  };
}
