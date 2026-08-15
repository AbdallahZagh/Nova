import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type Href, router } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  searchApi,
  type SearchProject,
  type SearchTask,
  type SearchUser,
  type SearchWhiteboard,
} from "@/api/search";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";

type ResultItem = {
  id: string;
  type: "project" | "whiteboard" | "task" | "user";
  label: string;
  subtitle?: string;
  href: Href | null;
};

const ICONS: Record<ResultItem["type"], keyof typeof Ionicons.glyphMap> = {
  project: "folder-open-outline",
  whiteboard: "easel-outline",
  task: "checkbox-outline",
  user: "person-outline",
};

function userName(user: SearchUser) {
  return user.name ?? user.fullName ?? user.email ?? "Unknown user";
}

function groupResults(
  projects: SearchProject[],
  whiteboards: SearchWhiteboard[],
  tasks: SearchTask[],
  users: SearchUser[],
  currentUserId?: string,
): { title: string; data: ResultItem[] }[] {
  const sections: { title: string; data: ResultItem[] }[] = [];
  if (projects.length) {
    sections.push({
      title: "Projects",
      data: projects.map((project) => ({
        id: `project-${project.id}`,
        type: "project" as const,
        label: project.name,
        subtitle: project.description ?? project.status,
        href: `/(main)/project/${project.id}` as Href,
      })),
    });
  }
  if (whiteboards.length) {
    sections.push({
      title: "Whiteboards",
      data: whiteboards.map((board) => ({
        id: `whiteboard-${board.id}`,
        type: "whiteboard" as const,
        label: board.title,
        subtitle: board.project?.name ?? "Personal whiteboard",
        href: `/(main)/whiteboard/${board.id}` as Href,
      })),
    });
  }
  if (tasks.length) {
    sections.push({
      title: "Tasks",
      data: tasks.map((task) => {
        const projectId = task.projectId ?? task.project?.id ?? "";
        return {
          id: `task-${task.id}`,
          type: "task" as const,
          label: task.title,
          subtitle: task.project?.name ?? "Task",
          href: {
            pathname: "/(main)/task/[id]",
            params: {
              id: task.id,
              ...(projectId ? { projectId } : {}),
            },
          } as Href,
        };
      }),
    });
  }
  if (users.length) {
    sections.push({
      title: "People",
      data: users.map((user) => ({
        id: `user-${user.id}`,
        type: "user" as const,
        label: userName(user),
        subtitle: user.username ?? user.email ?? "",
        href:
          user.id === currentUserId
            ? ("/(main)/profile" as Href)
            : ({
                pathname: "/(main)/user/[id]",
                params: { id: user.id },
              } as Href),
      })),
    });
  }
  return sections;
}

function ResultCard({
  item,
  accent,
}: {
  item: ResultItem;
  accent: string;
}) {
  const content = (
    <View className="flex-row items-center gap-3">
      <View className="h-12 w-12 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
        <Ionicons name={ICONS[item.type]} size={20} color={accent} />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-[15px] font-black text-primary dark:text-dark-primary"
        >
          {item.label}
        </Text>
        {item.subtitle ? (
          <Text
            numberOfLines={1}
            className="mt-1 text-sm text-muted dark:text-dark-muted"
          >
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      {item.href ? (
        <Ionicons name="chevron-forward" size={16} color={accent} />
      ) : null}
    </View>
  );

  if (!item.href) {
    return (
      <View className="rounded-nova-xl border border-glass bg-sidebar p-4 dark:border-dark-glass dark:bg-dark-sidebar">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.label}`}
      onPress={() => router.push(item.href as Href)}
      className="rounded-nova-xl border border-glass bg-sidebar p-4 active:opacity-75 dark:border-dark-glass dark:bg-dark-sidebar"
    >
      {content}
    </Pressable>
  );
}

export default function SearchScreen() {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [projects, setProjects] = useState<SearchProject[]>([]);
  const [whiteboards, setWhiteboards] = useState<SearchWhiteboard[]>([]);
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!debouncedQuery) {
        setProjects([]);
        setWhiteboards([]);
        setTasks([]);
        setUsers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const results = await searchApi(debouncedQuery);
        if (cancelled) return;
        setProjects(results.projects);
        setWhiteboards(results.whiteboards);
        setTasks(results.tasks);
        setUsers(results.users);
      } catch (error) {
        if (cancelled) return;
        setProjects([]);
        setWhiteboards([]);
        setTasks([]);
        setUsers([]);
        showSnackbar({
          variant: "error",
          title: "Search failed",
          message: getApiErrorMessage(error, "Please try again."),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, showSnackbar]);

  const sections = useMemo(
    () => groupResults(projects, whiteboards, tasks, users, currentUserId),
    [currentUserId, projects, tasks, users, whiteboards],
  );
  const hasResults = sections.length > 0;

  const hasQuery = debouncedQuery.length > 0;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 p-5 pb-32"
      >
        <View className="rounded-nova-xl border border-glass bg-sidebar p-5 dark:border-dark-glass dark:bg-dark-sidebar">
          <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
            Search
          </Text>
          <Text className="mt-1 text-sm leading-5 text-muted dark:text-dark-muted">
            Find projects, whiteboards, tasks, and people.
          </Text>

          <View className="mt-5 min-h-[50px] flex-row items-center rounded-nova border border-glass bg-glass-button px-3 dark:border-dark-glass dark:bg-dark-glass-button">
            <Ionicons name="search-outline" size={18} color={palette.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search the workspace..."
              placeholderTextColor={palette.muted}
              selectionColor={palette.accent}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 px-3 py-3 text-[15px] text-primary dark:text-dark-primary"
            />
            {loading ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery("")}
                className="h-8 w-8 items-center justify-center"
              >
                <Ionicons name="close-circle" size={18} color={palette.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {!hasQuery ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Ionicons name="search-outline" size={32} color={palette.accent} />
            <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
              Start typing to search
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              Results include boards you can open, plus projects, tasks, and people.
            </Text>
          </View>
        ) : loading && !hasResults ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <ActivityIndicator color={palette.accent} />
            <Text className="mt-3 text-sm text-muted dark:text-dark-muted">
              Searching...
            </Text>
          </View>
        ) : !hasResults ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Ionicons name="file-tray-outline" size={32} color={palette.accent} />
            <Text className="mt-3 text-center font-black text-primary dark:text-dark-primary">
              No results found
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              Try another name for a board, project, task, or person.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.title} className="gap-3">
              <Text className="text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
                {section.title}
              </Text>
              {section.data.map((item) => (
                <ResultCard key={item.id} item={item} accent={palette.accent} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
