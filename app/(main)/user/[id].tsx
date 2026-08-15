import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import { getUserProfileApi } from "@/api/users";
import type { ApiUser, ApiUserProject } from "@/api/types";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { PageSkeleton } from "@/components/Skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";

const projectCountKeys = [
  "projectCount",
  "projectsCount",
  "totalProjects",
  "project_count",
  "projects_count",
  "total_projects",
] as const;

const taskCountKeys = [
  "taskCount",
  "tasksCount",
  "totalTasks",
  "task_count",
  "tasks_count",
  "total_tasks",
] as const;

function pickNumber(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return 0;
}

function extractCounts(user?: ApiUser | null) {
  if (!user) return { projectCount: 0, taskCount: 0 };
  const root = user as Record<string, unknown>;
  const meta =
    typeof root._meta === "object" && root._meta !== null
      ? (root._meta as Record<string, unknown>)
      : null;
  const stats =
    typeof root.stats === "object" && root.stats !== null
      ? (root.stats as Record<string, unknown>)
      : null;

  return {
    projectCount:
      pickNumber(root, projectCountKeys) ||
      (meta ? pickNumber(meta, projectCountKeys) : 0) ||
      (stats ? pickNumber(stats, projectCountKeys) : 0),
    taskCount:
      pickNumber(root, taskCountKeys) ||
      (meta ? pickNumber(meta, taskCountKeys) : 0) ||
      (stats ? pickNumber(stats, taskCountKeys) : 0),
  };
}

function updateCompletion(project: ApiUserProject) {
  const assigned = project.userTasksCount ?? 0;
  if (!assigned) return 0;
  return Math.round(((project.completedUserTasksCount ?? 0) / assigned) * 100);
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const userId = typeof params.id === "string" ? params.id : "";
  const currentUserId = useAuthStore((state) => state.user?.id);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    if (userId === currentUserId) {
      router.replace("/(main)/profile");
      return;
    }
    setLoading(true);
    try {
      setProfile(await getUserProfileApi(userId));
    } catch (error) {
      setProfile(null);
      showSnackbar({
        variant: "error",
        title: "Profile failed",
        message: getApiErrorMessage(error, "Could not load this user profile."),
      });
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [currentUserId, showSnackbar, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (initialLoading) return <PageSkeleton />;

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-main px-6 dark:bg-dark-main">
        <Text className="text-center text-base font-black text-primary dark:text-dark-primary">
          User not found
        </Text>
        <Text className="mt-2 text-center text-sm text-muted dark:text-dark-muted">
          This profile may be unavailable.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-5 rounded-nova bg-accent px-4 py-2.5 dark:bg-dark-accent"
        >
          <Text className="font-black text-white">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const counts = extractCounts(profile);
  const projects = profile.projects ?? [];
  const username = profile.username
    ? profile.username.startsWith("@")
      ? profile.username
      : `@${profile.username}`
    : null;

  return (
    <ScrollView
      className="flex-1 bg-main dark:bg-dark-main"
      contentContainerClassName="gap-5 p-5 pb-36"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadProfile} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <View className="flex-row items-center gap-4">
          <UserAvatar
            name={profile.fullName}
            avatarUrl={profile.avatarUrl}
            size="xl"
          />
          <View className="flex-1">
            <Text className="text-[24px] font-black text-primary dark:text-dark-primary">
              {profile.fullName ?? "Nova user"}
            </Text>
            {username ? (
              <Text className="mt-1 text-[13px] font-bold text-accent dark:text-dark-accent">
                {username}
              </Text>
            ) : null}
            <Text className="mt-1 text-[14px] leading-5 text-muted dark:text-dark-muted">
              {profile.roleTitle ?? "Team member"}
            </Text>
            <Text className="mt-0.5 text-[13px] text-subtle dark:text-dark-subtle">
              {profile.email ?? ""}
            </Text>
          </View>
        </View>
        {profile.bio ? (
          <Text className="mt-4 text-[14px] leading-5 text-muted dark:text-dark-muted">
            {profile.bio}
          </Text>
        ) : null}
        <View className="mt-5 flex-row gap-3">
          <View className="flex-1 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-xl font-black text-primary dark:text-dark-primary">
              {counts.projectCount}
            </Text>
            <Text className="mt-1 text-xs font-bold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              Projects
            </Text>
          </View>
          <View className="flex-1 rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <Text className="text-xl font-black text-primary dark:text-dark-primary">
              {counts.taskCount}
            </Text>
            <Text className="mt-1 text-xs font-bold uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
              Tasks
            </Text>
          </View>
        </View>
      </View>

      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <Text className="text-[16px] font-black text-primary dark:text-dark-primary">
          Recent Activity
        </Text>
        <Text className="mb-4 mt-0.5 text-xs text-muted dark:text-dark-muted">
          Yearly task activity map.
        </Text>
        <ActivityHeatmap activity={profile.activity} />
      </View>

      <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
        <Text className="text-[16px] font-black text-primary dark:text-dark-primary">
          Projects
        </Text>
        <Text className="mb-4 mt-0.5 text-xs text-muted dark:text-dark-muted">
          Read-only project membership.
        </Text>
        {projects.length === 0 ? (
          <Text className="rounded-nova border border-glass bg-glass-card p-4 text-center text-sm text-muted dark:border-dark-glass dark:bg-dark-glass-card dark:text-dark-muted">
            No projects to display.
          </Text>
        ) : (
          <View className="gap-3">
            {projects.map((project) => {
              const completion = updateCompletion(project);
              return (
                <View
                  key={project.id}
                  className="rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-black text-primary dark:text-dark-primary">
                        {project.name}
                      </Text>
                      <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
                        {project.description || "No description"}
                      </Text>
                    </View>
                    <Text className="rounded-full border border-glass px-2 py-1 text-[10px] font-black uppercase text-accent dark:border-dark-glass dark:text-dark-accent">
                      {project.role}
                    </Text>
                  </View>
                  <View className="mt-4 flex-row flex-wrap gap-3">
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {project.status}
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {project.completedUserTasksCount ?? 0}/
                      {project.userTasksCount ?? 0} tasks
                    </Text>
                  </View>
                  <View className="mt-3 h-2 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
                    <View
                      className="h-full rounded-full bg-accent dark:bg-dark-accent"
                      style={{ width: `${completion}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
