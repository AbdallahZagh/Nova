"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderKanban,
  ListChecks,
  Mail,
  ShieldAlert,
} from "lucide-react";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
import { GlassCard } from "@/components/ui/GlassCard";
import { getInitials, type UserProfile } from "@/components/providers/UserProvider";
import { ApiError } from "@/lib/api/client";
import { getUserProfileApi } from "@/lib/api/users";
import { apiUserToProfile } from "@/lib/api/user-mapper";
import { cn } from "@/lib/cn";

function formatDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function roleBadgeClass(role: string) {
  if (role === "OWNER") return "border-accent/30 bg-accent/10 text-accent";
  if (role === "ADMIN") return "border-warning/40 bg-warning/10 text-warning";
  if (role === "VIEWER") return "border-primary/20 bg-glass-button/50 text-primary/45";
  return "border-glass bg-main/40 text-primary/55";
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.id === "string" ? params.id : "";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    getUserProfileApi(userId)
      .then((user) => {
        if (!cancelled) setProfile(apiUserToProfile(user));
      })
      .catch((err) => {
        if (cancelled) return;
        setProfile(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load this user profile.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ProfileSkeleton />;

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <ShieldAlert className="size-7" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-primary">User not found</h1>
          <p className="mt-1 text-sm text-primary/60">
            {error || "This profile may be unavailable."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Go back
        </button>
      </div>
    );
  }

  const initials = getInitials(profile.name);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-9 items-center justify-center rounded-xl border border-glass bg-glass-button text-primary/60 transition hover:text-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            User Profile
          </h1>
          <p className="text-sm text-primary/50">Read-only workspace profile</p>
        </div>
      </div>

      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-linear-135 from-accent to-accent/60 text-3xl font-bold text-white shadow-lg shadow-accent/25">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="size-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-primary">{profile.name}</h2>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                Active
              </span>
            </div>
            {profile.username ? (
              <p className="mt-0.5 text-sm font-medium text-accent">
                {profile.username}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-primary/70">{profile.role}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-primary/55">
              <Mail className="size-3.5" />
              {profile.email}
            </p>
            {profile.bio ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary/65">
                {profile.bio}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-48">
            <div className="rounded-xl border border-glass bg-glass-button/50 px-4 py-3 text-center">
              <p className="text-xl font-bold text-primary">{profile.projectCount}</p>
              <p className="text-[11px] text-primary/50">Projects</p>
            </div>
            <div className="rounded-xl border border-glass bg-glass-button/50 px-4 py-3 text-center">
              <p className="text-xl font-bold text-primary">{profile.taskCount}</p>
              <p className="text-[11px] text-primary/50">Tasks</p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard title="Recent Activity">
        <ActivityHeatmap activity={profile.activity} />
      </GlassCard>

      <GlassCard className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <FolderKanban className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary">Projects</h2>
            <p className="text-xs text-primary/50">
              Read-only project membership
            </p>
          </div>
        </div>

        {profile.projects.length === 0 ? (
          <p className="rounded-2xl border border-glass bg-glass-button/40 px-4 py-6 text-center text-sm text-primary/45">
            No projects found.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {profile.projects.map((project) => {
              const completion =
                project.userTasksCount > 0
                  ? Math.round(
                      (project.completedUserTasksCount / project.userTasksCount) *
                        100,
                    )
                  : 0;

              return (
                <article
                  key={project.id}
                  className="rounded-2xl border border-glass bg-glass-button/45 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-primary">
                        {project.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-primary/55">
                        {project.description || "No description"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                        roleBadgeClass(project.role),
                      )}
                    >
                      {project.role}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-primary/50">
                    <span className="rounded-md border border-glass bg-main/35 px-2 py-1">
                      {project.status}
                    </span>
                    <span>Updated {formatDate(project.updatedAt)}</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-primary/55">
                        <ListChecks className="size-3.5" />
                        User tasks
                      </span>
                      <span className="font-semibold text-primary">
                        {project.completedUserTasksCount}/{project.userTasksCount}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-main/50">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${completion}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-glass pt-3 text-xs text-primary/45">
                    <span>
                      {project.totalTasksCount} total task
                      {project.totalTasksCount === 1 ? "" : "s"}
                    </span>
                    <span>Created {formatDate(project.createdAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
