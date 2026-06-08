"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import {
  ProjectMemberPicker,
  type SelectedProjectMember,
} from "@/components/projects/ProjectMemberPicker";
import { UserProfileLink } from "@/components/users/UserProfileLink";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  addProjectMembersApi,
  deleteProjectMemberApi,
  updateProjectMemberRoleApi,
} from "@/lib/api/projects";
import { cn } from "@/lib/cn";
import type { Project, ProjectMember, ProjectMemberRole } from "@/lib/projects";

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

type ManageTeamModalProps = {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
};

const MANAGED_ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

const roleStyles: Record<ProjectMemberRole, string> = {
  OWNER: "border-accent/50 bg-accent/10 text-accent",
  ADMIN: "border-warning/50 bg-warning/10 text-warning",
  MEMBER: "border-primary/25 bg-glass-button text-primary/65",
  VIEWER: "border-primary/20 bg-glass-button/50 text-primary/45",
};

function roleLabel(role: ProjectMemberRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function memberUserId(member: ProjectMember) {
  return member.userId ?? member.id ?? "";
}

function showName(member: ProjectMember) {
  return member.name ?? member.email ?? member.initials;
}

export function ManageTeamModal({
  isOpen,
  onClose,
  project,
  canManage,
  onChanged,
}: ManageTeamModalProps) {
  const { toast } = useToast();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [invitees, setInvitees] = useState<SelectedProjectMember[]>([]);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

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

  const showError = (title: string, err: unknown) => {
    toast({
      variant: "error",
      title,
      message: err instanceof ApiError ? err.message : "Please try again.",
    });
  };

  const refresh = async () => {
    await onChanged();
  };

  const handleInvite = async () => {
    if (invitees.length === 0 || inviting) return;

    setInviting(true);
    try {
      await addProjectMembersApi(
        project.id,
        invitees.map((member) => ({
          userId: member.user.id,
          role: member.role,
        })),
      );
      setInvitees([]);
      await refresh();
      toast({
        variant: "success",
        title: "Team updated",
        message: "New members were added to the project.",
      });
    } catch (err) {
      showError("Could not invite members", err);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (
    member: ProjectMember,
    role: Exclude<ProjectMemberRole, "OWNER">,
  ) => {
    const userId = memberUserId(member);
    if (!userId || savingMemberId) return;

    setSavingMemberId(userId);
    try {
      await updateProjectMemberRoleApi(project.id, userId, role);
      await refresh();
      toast({
        variant: "success",
        title: "Role updated",
        message: `${showName(member)} is now ${roleLabel(role)}.`,
      });
    } catch (err) {
      showError("Could not update role", err);
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleRemove = async (member: ProjectMember) => {
    const userId = memberUserId(member);
    if (!userId || savingMemberId) return;

    setSavingMemberId(userId);
    try {
      await deleteProjectMemberApi(project.id, userId);
      await refresh();
      toast({
        variant: "success",
        title: "Member removed",
        message: `${showName(member)} was removed from the project.`,
      });
    } catch (err) {
      showError("Could not remove member", err);
    } finally {
      setSavingMemberId(null);
    }
  };

  const existingUserIds = project.teamMembers
    .map(memberUserId)
    .filter(Boolean);

  return createPortal(
    <div
      className="fixed inset-0 z-130 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-team-title"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="relative max-h-[85dvh] overflow-y-auto rounded-2xl border border-glass bg-sidebar px-6 py-4 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="manage-team-title"
                className="text-xl font-semibold tracking-tight text-primary"
              >
                Team Management
              </h2>
              <p className="mt-0.5 text-sm text-primary/75">
                Manage access for {project.title}.
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

          {canManage && (
            <section className="mt-6 rounded-2xl border border-glass bg-glass-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/75">
                  Invite Members
                </h3>
                <UserPlus className="size-4 text-primary/40" />
              </div>
              <ProjectMemberPicker
                value={invitees}
                onChange={setInvitees}
                excludeUserIds={existingUserIds}
              />
              <button
                type="button"
                onClick={() => void handleInvite()}
                disabled={invitees.length === 0 || inviting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? <Loader2 className="size-4 animate-spin" /> : null}
                Invite
              </button>
            </section>
          )}

          <section className="mt-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary/75">
              Members
            </h3>
            <ul className="space-y-2">
              {project.teamMembers.map((member, index) => {
                const userId = memberUserId(member);
                const isBusy = savingMemberId === userId;
                const canEditMember =
                  canManage && member.role !== "OWNER" && Boolean(userId);

                return (
                  <li
                    key={`${userId || member.initials}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-glass bg-glass-card px-3 py-3"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button text-xs font-semibold text-primary">
                      {member.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.imageUrl}
                          alt={showName(member)}
                          className="size-full object-cover"
                        />
                      ) : (
                        member.initials
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <UserProfileLink
                        userId={userId}
                        className="block truncate text-sm font-medium text-primary"
                        title={`View ${showName(member)}`}
                      >
                        {showName(member)}
                      </UserProfileLink>
                      {member.email ? (
                        <p className="truncate text-xs text-primary/45">
                          {member.email}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        roleStyles[member.role],
                      )}
                    >
                      {roleLabel(member.role)}
                    </span>
                    {canEditMember && (
                      <>
                        <Select
                          value={member.role}
                          onChange={(role) =>
                            void handleRoleChange(
                              member,
                              role as Exclude<ProjectMemberRole, "OWNER">,
                            )
                          }
                          options={MANAGED_ROLE_OPTIONS}
                          variant="compact"
                          className="w-28 shrink-0"
                          aria-label="Member role"
                          disabled={isBusy}
                        />
                        <button
                          type="button"
                          onClick={() => void handleRemove(member)}
                          disabled={isBusy}
                          aria-label={`Remove ${showName(member)}`}
                          className="shrink-0 rounded-lg border border-red-500/30 p-2 text-red-400 transition hover:bg-red-500/10 disabled:opacity-40 light:border-red-500/40 light:text-red-600"
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
