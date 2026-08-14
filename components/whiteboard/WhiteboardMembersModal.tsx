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
import { getProjectApi } from "@/lib/api/projects";
import {
  addWhiteboardMembersApi,
  createWhiteboardInviteApi,
  deleteWhiteboardMemberApi,
  updateWhiteboardMemberApi,
} from "@/lib/api/whiteboards";
import type { SearchUser } from "@/lib/api/users";
import { cn } from "@/lib/cn";
import type {
  Whiteboard,
  WhiteboardMember,
  WhiteboardRole,
} from "@/lib/whiteboard/types";

function subscribe() {
  return () => {};
}

type WhiteboardMembersModalProps = {
  isOpen: boolean;
  board: Whiteboard;
  canManage: boolean;
  onClose: () => void;
  onChanged: (board: Whiteboard) => void;
};

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

const roleStyles: Record<WhiteboardRole, string> = {
  ADMIN: "border-warning/50 bg-warning/10 text-warning",
  MEMBER: "border-primary/25 bg-glass-button text-primary/65",
  VIEWER: "border-primary/20 bg-glass-button/50 text-primary/45",
};

function roleLabel(role: WhiteboardRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WhiteboardMembersModal({
  isOpen,
  board,
  canManage,
  onClose,
  onChanged,
}: WhiteboardMembersModalProps) {
  const { toast } = useToast();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [invitees, setInvitees] = useState<SelectedProjectMember[]>([]);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [candidates, setCandidates] = useState<SearchUser[] | undefined>();
  const [linkRole, setLinkRole] = useState<WhiteboardRole>("VIEWER");
  const [linkUrl, setLinkUrl] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);

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

  useEffect(() => {
    if (!isOpen || !board.projectId) {
      setCandidates(undefined);
      return;
    }
    let cancelled = false;
    void getProjectApi(board.projectId)
      .then((project) => {
        if (cancelled) return;
        setCandidates(
          project.teamMembers
            .map((member) => ({
              id: member.userId ?? member.id ?? "",
              fullName: member.name ?? member.email ?? member.initials,
              email: member.email ?? "",
              avatarUrl: member.imageUrl ?? null,
            }))
            .filter((user) => user.id),
        );
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [board.projectId, isOpen]);

  if (!mounted || !isOpen) return null;

  const showError = (title: string, err: unknown) => {
    toast({
      variant: "error",
      title,
      message: err instanceof ApiError ? err.message : "Please try again.",
    });
  };

  const handleInvite = async () => {
    if (invitees.length === 0 || inviting) return;
    setInviting(true);
    try {
      const updated = await addWhiteboardMembersApi(
        board.id,
        invitees.map((member) => ({
          userId: member.user.id,
          role: member.role,
        })),
      );
      setInvitees([]);
      onChanged(updated);
      toast({
        variant: "success",
        title: "Collaborators updated",
        message: "New people were added to this board.",
      });
    } catch (err) {
      showError("Could not add collaborators", err);
    } finally {
      setInviting(false);
    }
  };

  const handleCreateLink = async () => {
    if (creatingLink) return;
    setCreatingLink(true);
    try {
      const invite = await createWhiteboardInviteApi(board.id, linkRole);
      const url = `${window.location.origin}${invite.url}`;
      setLinkUrl(url);
      await navigator.clipboard.writeText(url);
      toast({
        variant: "success",
        title: "One-time link copied",
        message: `Anyone with this link joins as ${linkRole.toLowerCase()}. It works once.`,
      });
    } catch (err) {
      showError("Could not create invite link", err);
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRoleChange = async (member: WhiteboardMember, role: WhiteboardRole) => {
    if (savingMemberId) return;
    setSavingMemberId(member.userId);
    try {
      const updated = await updateWhiteboardMemberApi(board.id, member.userId, role);
      onChanged(updated);
    } catch (err) {
      showError("Could not update role", err);
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleRemove = async (member: WhiteboardMember) => {
    if (savingMemberId) return;
    setSavingMemberId(member.userId);
    try {
      const updated = await deleteWhiteboardMemberApi(board.id, member.userId);
      onChanged(updated);
    } catch (err) {
      showError("Could not remove collaborator", err);
    } finally {
      setSavingMemberId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-130 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl">
        <div className="relative max-h-[85dvh] overflow-y-auto rounded-2xl border border-glass bg-sidebar px-6 py-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary">Collaborators</h2>
              <p className="mt-0.5 text-sm text-primary/75">
                {board.projectId
                  ? "Add people from this project. Admins can save the board as an image."
                  : "Add anyone. Admins can save the board as an image."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-primary/75 hover:text-accent"
            >
              <X className="size-6" />
            </button>
          </div>

          {canManage ? (
            <section className="mt-6 rounded-2xl border border-glass bg-glass-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/75">
                  Invite
                </h3>
                <UserPlus className="size-4 text-primary/40" />
              </div>
              <ProjectMemberPicker
                value={invitees}
                onChange={setInvitees}
                excludeUserIds={board.members.map((member) => member.userId)}
                candidates={board.projectId ? candidates : undefined}
                placeholder={
                  board.projectId
                    ? "Search project members..."
                    : "Search by name or email..."
                }
              />
              <button
                type="button"
                onClick={() => void handleInvite()}
                disabled={invitees.length === 0 || inviting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {inviting ? <Loader2 className="size-4 animate-spin" /> : null}
                Invite
              </button>
              <div className="mt-4 border-t border-glass pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/75">
                  One-time link
                </p>
                <p className="mt-1 text-xs text-primary/50">
                  Choose the role, then copy a link that works only once.
                </p>
                <div className="mt-3 flex gap-2">
                  <Select
                    value={linkRole}
                    onChange={(role) => setLinkRole(role as WhiteboardRole)}
                    options={ROLE_OPTIONS}
                    variant="compact"
                    className="w-28"
                    aria-label="Invite link role"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateLink()}
                    disabled={creatingLink}
                    className="flex-1 rounded-xl border border-glass px-3 py-2 text-sm font-semibold text-primary hover:border-accent/40 hover:text-accent disabled:opacity-50"
                  >
                    {creatingLink ? "Creating..." : "Copy link"}
                  </button>
                </div>
                {linkUrl ? (
                  <p className="mt-2 truncate text-xs text-primary/45">{linkUrl}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="mt-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary/75">
              On this board
            </h3>
            <ul className="space-y-2">
              {board.members.map((member) => {
                const isBusy = savingMemberId === member.userId;
                return (
                  <li
                    key={member.userId}
                    className="flex items-center gap-3 rounded-xl border border-glass bg-glass-card px-3 py-3"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button text-xs font-semibold">
                      {member.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.avatarUrl}
                          alt={member.fullName}
                          className="size-full object-cover"
                        />
                      ) : (
                        initials(member.fullName)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <UserProfileLink
                        userId={member.userId}
                        className="block truncate text-sm font-medium text-primary"
                      >
                        {member.fullName}
                      </UserProfileLink>
                      <p className="truncate text-xs text-primary/45">{member.email}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        roleStyles[member.role],
                      )}
                    >
                      {roleLabel(member.role)}
                    </span>
                    {canManage ? (
                      <>
                        <Select
                          value={member.role}
                          onChange={(role) =>
                            void handleRoleChange(member, role as WhiteboardRole)
                          }
                          options={ROLE_OPTIONS}
                          variant="compact"
                          className="w-28 shrink-0"
                          aria-label="Collaborator role"
                          disabled={isBusy}
                        />
                        <button
                          type="button"
                          onClick={() => void handleRemove(member)}
                          disabled={isBusy}
                          aria-label={`Remove ${member.fullName}`}
                          className="shrink-0 rounded-lg border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </>
                    ) : null}
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
