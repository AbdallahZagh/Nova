"use client";

import { useCallback, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, Loader2, Mail, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";
import { UserAvatar } from "@/components/users/UserAvatar";

type ProfileHeroProps = {
  name: string;
  username?: string | null;
  role?: string | null;
  email?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  initials: string;
  projectCount: number;
  taskCount: number;
  badge?: ReactNode;
  canEditAvatar?: boolean;
  uploadingAvatar?: boolean;
  onPickAvatar?: (file: File) => void;
  onDeleteAvatar?: () => void;
};

export function ProfileHero({
  name,
  username,
  role,
  email,
  bio,
  avatarUrl,
  initials,
  projectCount,
  taskCount,
  badge,
  canEditAvatar = false,
  uploadingAvatar = false,
  onPickAvatar,
  onDeleteAvatar,
}: ProfileHeroProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    triggerRef,
    menuOpen,
    96,
    { minWidth: 168 },
  );
  const close = useCallback(() => setMenuOpen(false), []);
  useFloatingClickOutside(menuOpen, close, triggerRef, menuRef);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPickAvatar?.(file);
  };

  return (
    <GlassCard>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <UserAvatar
              name={name}
              avatarUrl={avatarUrl}
              initials={initials}
              size="xl"
            />
            {canEditAvatar ? (
              <>
                <button
                  ref={triggerRef}
                  type="button"
                  disabled={uploadingAvatar}
                  aria-label="Profile photo actions"
                  onClick={() => {
                    if (!menuOpen) precomputeStyle();
                    setMenuOpen((open) => !open);
                  }}
                  className="absolute -bottom-0.5 -right-0.5 flex size-8 items-center justify-center rounded-full border border-glass bg-sidebar text-primary shadow-sm transition hover:text-accent disabled:opacity-60"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <MoreHorizontal className="size-3.5" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={uploadingAvatar}
                  onChange={handleFile}
                />
                <FloatingMenuPortal
                  isOpen={menuOpen}
                  triggerRef={triggerRef}
                  menuRef={menuRef}
                  style={style}
                  role="menu"
                  aria-label="Profile photo menu"
                  className="overflow-hidden rounded-xl border border-glass bg-sidebar py-1 shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      fileRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-primary transition hover:bg-glass-button"
                  >
                    {avatarUrl ? (
                      <Pencil className="size-3.5 shrink-0" />
                    ) : (
                      <ImagePlus className="size-3.5 shrink-0" />
                    )}
                    {avatarUrl ? "Edit" : "Add photo"}
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onDeleteAvatar?.();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10 light:text-red-600"
                    >
                      <Trash2 className="size-3.5 shrink-0" />
                      Delete
                    </button>
                  ) : null}
                </FloatingMenuPortal>
              </>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-primary">
                {name}
              </h2>
              {badge}
            </div>
            {username ? (
              <p className="mt-1 text-sm font-medium text-accent">{username}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-primary/55">
              {role ? <span>{role}</span> : null}
              {role && email ? (
                <span className="text-primary/25" aria-hidden>
                  ·
                </span>
              ) : null}
              {email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {email}
                </span>
              ) : null}
            </div>
            {bio ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary/65">
                {bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex gap-6 sm:pt-1">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {projectCount}
            </p>
            <p className="mt-0.5 text-xs text-primary/50">Projects</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {taskCount}
            </p>
            <p className="mt-0.5 text-xs text-primary/50">Tasks</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
