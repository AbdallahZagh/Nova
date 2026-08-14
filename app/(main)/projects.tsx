import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { getApiErrorMessage } from "@/api/apiClient";
import {
  canDeleteProject,
  canEditProjectDetails,
  createProjectApi,
  deleteProjectApi,
  getProjectMemberRole,
  listProjectsApi,
  PROJECT_STATUS_OPTIONS,
  projectStatusLabel,
  sortProjectsByStatus,
  updateProjectApi,
  type EditableProjectMemberRole,
  type Project,
  type ProjectFormInput,
  type ProjectStatus,
} from "@/api/projects";
import { searchUsersApi, type SearchUser } from "@/api/users";
import { BottomDrawer } from "@/components/BottomDrawer";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { getPalette } from "@/theme/colors";

type FilterStatus = "All" | ProjectStatus;
type DrawerMode = "create" | "edit";
type SelectedProjectMember = {
  user: SearchUser;
  role: EditableProjectMemberRole;
};

const FILTERS: FilterStatus[] = [
  "All",
  "Active",
  "In Progress",
  "Completed",
  "Archived",
];

const MEMBER_ROLE_OPTIONS: EditableProjectMemberRole[] = [
  "ADMIN",
  "MEMBER",
  "VIEWER",
];

const statusClasses: Record<ProjectStatus, string> = {
  Active: "border-accent/50 text-accent dark:border-dark-accent/50 dark:text-dark-accent",
  "In Progress": "border-warning/50 text-warning dark:border-dark-warning/50 dark:text-dark-warning",
  Completed: "border-success/50 text-success dark:border-dark-success/50 dark:text-dark-success",
  Archived: "border-glass text-muted dark:border-dark-glass dark:text-dark-muted",
};

function initialsFromName(name?: string | null) {
  const parts = (name ?? "NA").trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-extrabold uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
      {children}
    </Text>
  );
}

function ProjectCard({
  project,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onOpen,
}: {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onOpen: (project: Project) => void;
}) {
  const progress = Math.max(0, Math.min(100, project.progress));
  const visibleMembers = project.teamMembers.slice(0, 4);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${project.title}`}
      onPress={() => onOpen(project)}
      className="rounded-nova-xl border border-glass bg-sidebar p-5 active:opacity-80 dark:border-dark-glass dark:bg-dark-sidebar"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
            {project.title}
          </Text>
          <Text className="mt-2 text-[14px] leading-5 text-muted dark:text-dark-muted">
            {project.description || "No description yet."}
          </Text>
        </View>
        <Text
          className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClasses[project.status]}`}
        >
          {projectStatusLabel(project.status)}
        </Text>
      </View>

      <View className="mt-5">
        <View className="h-2 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
          <View
            className="h-full rounded-full bg-accent dark:bg-dark-accent"
            style={{ width: `${progress}%` }}
          />
        </View>
        <View className="mt-3 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-xs font-bold text-muted dark:text-dark-muted">
              {progress}% complete
            </Text>
            {project.totalTasks != null ? (
              <Text className="mt-0.5 text-[11px] text-subtle dark:text-dark-subtle">
                {project.completedTasks ?? 0}/{project.totalTasks} tasks
                {project.totalSubtasks != null && project.totalSubtasks > 0
                  ? ` - ${project.completedSubtasks ?? 0}/${project.totalSubtasks} subtasks`
                  : ""}
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-center">
            {visibleMembers.map((member, index) => (
              <View
                key={`${member.userId ?? member.id ?? member.initials}-${index}`}
                className="-ml-2 h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-accent/35 bg-glass-button first:ml-0 dark:border-dark-accent/35 dark:bg-dark-glass-button"
              >
                {member.imageUrl ? (
                  <Image
                    source={{ uri: member.imageUrl }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-[10px] font-black text-primary dark:text-dark-primary">
                    {member.initials}
                  </Text>
                )}
              </View>
            ))}
            {project.teamMembers.length > visibleMembers.length ? (
              <View className="-ml-2 h-8 w-8 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                <Text className="text-[10px] font-black text-muted dark:text-dark-muted">
                  +{project.teamMembers.length - visibleMembers.length}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {canEdit || canDelete ? (
        <View className="mt-5 flex-row gap-3">
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${project.title}`}
              onPress={() => onEdit(project)}
              className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-nova border border-glass bg-glass-button active:opacity-75 dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="create-outline" size={17} color="#c56010" />
              <Text className="text-sm font-extrabold text-muted dark:text-dark-muted">
                Edit
              </Text>
            </Pressable>
          ) : null}

          {canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${project.title}`}
            onPress={() => onDelete(project)}
            className="min-h-[44px] w-[52px] items-center justify-center rounded-nova border border-danger/40 bg-danger/10 active:opacity-75 dark:border-dark-danger/40 dark:bg-dark-danger/10"
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {PROJECT_STATUS_OPTIONS.map((status) => {
        const active = value === status;
        return (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={projectStatusLabel(status)}
            onPress={() => onChange(status)}
            className={`rounded-full border px-3 py-2 ${
              active
                ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            }`}
          >
            <Text
              className={`text-xs font-black ${
                active
                  ? "text-accent dark:text-dark-accent"
                  : "text-muted dark:text-dark-muted"
              }`}
            >
              {projectStatusLabel(status)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RolePicker({
  value,
  onChange,
}: {
  value: EditableProjectMemberRole;
  onChange: (role: EditableProjectMemberRole) => void;
}) {
  return (
    <View className="flex-row rounded-full border border-glass bg-glass-button p-1 dark:border-dark-glass dark:bg-dark-glass-button">
      {MEMBER_ROLE_OPTIONS.map((role) => {
        const active = value === role;
        return (
          <Pressable
            key={role}
            accessibilityRole="button"
            accessibilityLabel={role}
            onPress={() => onChange(role)}
            className={`rounded-full px-2.5 py-1.5 ${active ? "bg-accent dark:bg-dark-accent" : ""}`}
          >
            <Text
              className={`text-[10px] font-black ${
                active ? "text-white" : "text-muted dark:text-dark-muted"
              }`}
            >
              {role}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProjectMemberPicker({
  value,
  onChange,
}: {
  value: SelectedProjectMember[];
  onChange: (members: SelectedProjectMember[]) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      setLoading(true);
      searchUsersApi(trimmed)
        .then(setResults)
        .catch((error) => {
          setResults([]);
          showSnackbar({
            variant: "error",
            title: "User search failed",
            message: getApiErrorMessage(error, "Please try again."),
          });
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, showSnackbar]);

  const selectedIds = new Set(value.map((member) => member.user.id));
  const filteredResults = results.filter((user) => !selectedIds.has(user.id));

  const addUser = (user: SearchUser) => {
    onChange([...value, { user, role: "MEMBER" }]);
    setQuery("");
    setResults([]);
  };

  const removeUser = (userId: string) => {
    onChange(value.filter((member) => member.user.id !== userId));
  };

  const updateRole = (userId: string, role: EditableProjectMemberRole) => {
    onChange(
      value.map((member) =>
        member.user.id === userId ? { ...member, role } : member,
      ),
    );
  };

  return (
    <View className="gap-3">
      <View className="relative">
        <View className="min-h-[50px] flex-row items-center rounded-nova border border-glass bg-glass-button px-3 dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name="search-outline" size={18} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email..."
            placeholderTextColor={palette.muted}
            selectionColor={palette.accent}
            className="flex-1 px-3 py-3 text-[15px] text-primary dark:text-dark-primary"
            autoCapitalize="none"
          />
          {loading ? <ActivityIndicator size="small" color={palette.accent} /> : null}
        </View>

        {query.trim().length >= 2 ? (
          <View className="mt-2 max-h-56 overflow-hidden rounded-nova border border-glass bg-sidebar p-1.5 dark:border-dark-glass dark:bg-dark-sidebar">
            {loading ? (
              <Text className="px-3 py-3 text-sm text-muted dark:text-dark-muted">
                Searching...
              </Text>
            ) : filteredResults.length === 0 ? (
              <Text className="px-3 py-3 text-sm text-muted dark:text-dark-muted">
                No users found.
              </Text>
            ) : (
              filteredResults.map((user) => (
                <Pressable
                  key={user.id}
                  accessibilityRole="button"
                  onPress={() => addUser(user)}
                  className="flex-row items-center gap-3 rounded-nova px-3 py-2.5 active:bg-glass-button dark:active:bg-dark-glass-button"
                >
                  <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} className="h-full w-full" />
                    ) : (
                      <Text className="text-[11px] font-black text-primary dark:text-dark-primary">
                        {initialsFromName(user.fullName)}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-extrabold text-primary dark:text-dark-primary">
                      {user.fullName}
                    </Text>
                    <Text className="text-xs text-muted dark:text-dark-muted">
                      {user.email}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </View>

      {value.map((member) => (
        <View
          key={member.user.id}
          className="rounded-nova border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
              {member.user.avatarUrl ? (
                <Image source={{ uri: member.user.avatarUrl }} className="h-full w-full" />
              ) : (
                <Text className="text-[11px] font-black text-primary dark:text-dark-primary">
                  {initialsFromName(member.user.fullName)}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="font-extrabold text-primary dark:text-dark-primary">
                {member.user.fullName}
              </Text>
              <Text className="text-xs text-muted dark:text-dark-muted">
                {member.user.email}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${member.user.fullName}`}
              onPress={() => removeUser(member.user.id)}
              className="h-9 w-9 items-center justify-center rounded-full bg-glass-button active:opacity-75 dark:bg-dark-glass-button"
            >
              <Ionicons name="close-outline" size={20} color={palette.muted} />
            </Pressable>
          </View>
          <View className="mt-3">
            <RolePicker
              value={member.role}
              onChange={(role) => updateRole(member.user.id, role)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function ProjectDrawer({
  visible,
  mode,
  project,
  submitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: DrawerMode;
  project: Project | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: ProjectFormInput) => Promise<void>;
}) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const isEdit = mode === "edit";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("Active");
  const [selectedMembers, setSelectedMembers] = useState<SelectedProjectMember[]>([]);

  useEffect(() => {
    if (!visible) return;
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "Active");
    setSelectedMembers([]);
  }, [project, visible]);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      members: selectedMembers.map((member) => ({
        userId: member.user.id,
        role: member.role,
      })),
    });
  };

  return (
    <BottomDrawer
      visible={visible}
      title={isEdit ? "Edit Project" : "Create New Project"}
      subtitle={
        isEdit
          ? "Update project details."
          : "Set up a new workspace to organize your tasks."
      }
      closeDisabled={submitting}
      onClose={onClose}
    >
            <View>
              <FieldLabel>Project Name</FieldLabel>
              <View className="min-h-[50px] rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Elegance Hub Redesign"
                  placeholderTextColor={palette.muted}
                  selectionColor={palette.accent}
                  className="px-3.5 py-3 text-[15px] text-primary dark:text-dark-primary"
                />
              </View>
            </View>

            <View>
              <FieldLabel>Description</FieldLabel>
              <View className="min-h-[100px] rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Briefly describe the goals of this project..."
                  placeholderTextColor={palette.muted}
                  selectionColor={palette.accent}
                  multiline
                  textAlignVertical="top"
                  className="min-h-[100px] px-3.5 py-3 text-[15px] text-primary dark:text-dark-primary"
                />
              </View>
            </View>

            <View>
              <FieldLabel>Status</FieldLabel>
              <StatusPicker value={status} onChange={setStatus} />
            </View>

            {!isEdit ? (
              <View>
                <FieldLabel>Team Members</FieldLabel>
                <ProjectMemberPicker
                  value={selectedMembers}
                  onChange={setSelectedMembers}
                />
              </View>
            ) : null}

            <View className="flex-row gap-3 pt-1">
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={onClose}
                className="min-h-[50px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-card active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-card"
              >
                <Text className="text-[15px] font-extrabold text-muted dark:text-dark-muted">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={submitting || !title.trim()}
                onPress={submit}
                className="min-h-[50px] flex-1 flex-row items-center justify-center gap-2 rounded-nova bg-accent active:bg-accent-pressed disabled:opacity-50 dark:bg-dark-accent"
              >
                {submitting ? <ActivityIndicator color={palette.white} size="small" /> : null}
                <Text className="text-[15px] font-extrabold text-white">
                  {submitting
                    ? isEdit
                      ? "Saving..."
                      : "Creating..."
                    : isEdit
                      ? "Save Changes"
                      : "Create Project"}
                </Text>
              </Pressable>
            </View>
    </BottomDrawer>
  );
}

export default function ProjectsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const user = useAuthStore((state) => state.user);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("All");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await listProjectsApi();
      setProjects(data);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load projects",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const list =
      activeFilter === "All"
        ? projects
        : projects.filter((project) => project.status === activeFilter);
    return sortProjectsByStatus(list);
  }, [activeFilter, projects]);

  const canCreateProjects = useMemo(() => {
    if (user?.isDemo) return false;
    if (projects.length === 0) return true;
    return projects.some((project) =>
      canEditProjectDetails(getProjectMemberRole(project, user?.id)),
    );
  }, [projects, user?.id, user?.isDemo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, [loadProjects]);

  const openCreateDrawer = () => {
    if (!canCreateProjects) return;
    setDrawerMode("create");
    setEditingProject(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (project: Project) => {
    if (!canEditProjectDetails(getProjectMemberRole(project, user?.id))) return;
    setDrawerMode("edit");
    setEditingProject(project);
    setDrawerOpen(true);
  };

  const handleSubmit = async (input: ProjectFormInput) => {
    if (drawerMode === "create" && !canCreateProjects) return;
    if (
      drawerMode === "edit" &&
      editingProject &&
      !canEditProjectDetails(getProjectMemberRole(editingProject, user?.id))
    ) {
      return;
    }
    setSubmitting(true);
    try {
      if (drawerMode === "edit" && editingProject) {
        const saved = await updateProjectApi(editingProject.id, input);
        setProjects((current) =>
          sortProjectsByStatus(
            current.map((project) =>
              project.id === saved.id ? saved : project,
            ),
          ),
        );
        showSnackbar({
          variant: "success",
          title: "Project updated",
          message: `"${input.title}" was saved successfully.`,
        });
      } else {
        const created = await createProjectApi(input);
        setProjects((current) => sortProjectsByStatus([created, ...current]));
        showSnackbar({
          variant: "success",
          title: "Project created",
          message: `"${input.title}" is ready to use.`,
        });
      }
      setDrawerOpen(false);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: drawerMode === "edit" ? "Update failed" : "Create failed",
        message: getApiErrorMessage(error, "Could not save the project."),
      });
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProjectApi(deleteTarget.id);
      setProjects((current) =>
        current.filter((project) => project.id !== deleteTarget.id),
      );
      showSnackbar({
        variant: "success",
        title: "Project deleted",
        message: `"${deleteTarget.title}" was removed.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Delete failed",
        message: getApiErrorMessage(
          error,
          "Could not delete the project. You may not have permission.",
        ),
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-32"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[30px] font-black text-primary dark:text-dark-primary">
              Projects
            </Text>
            <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
              Manage and track your active projects.
            </Text>
          </View>
          {canCreateProjects ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New Project"
              onPress={openCreateDrawer}
              className="h-12 w-12 items-center justify-center rounded-nova bg-accent active:bg-accent-pressed dark:bg-dark-accent"
            >
              <Ionicons name="add-outline" size={26} color={palette.white} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 rounded-nova-xl border border-accent/35 bg-glass-card p-3 dark:bg-dark-glass-card"
        >
          {FILTERS.map((filter) => {
            const active = activeFilter === filter;
            return (
              <Pressable
                key={filter}
                accessibilityRole="button"
                onPress={() => setActiveFilter(filter)}
                className={`rounded-full border px-3 py-2 ${
                  active
                    ? "border-accent bg-accent/20 dark:border-dark-accent dark:bg-dark-accent/20"
                    : "border-accent/35 bg-glass-button dark:border-dark-accent/35 dark:bg-dark-glass-button"
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    active
                      ? "text-accent dark:text-dark-accent"
                      : "text-primary dark:text-dark-primary"
                  }`}
                >
                  {filter === "All" ? "All" : projectStatusLabel(filter)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredProjects.length === 0 ? (
          <View className="items-center rounded-nova-xl border border-glass bg-sidebar p-8 dark:border-dark-glass dark:bg-dark-sidebar">
            <Ionicons name="folder-open-outline" size={34} color={palette.accent} />
            <Text className="mt-3 text-center text-[16px] font-black text-primary dark:text-dark-primary">
              No projects found.
            </Text>
            {canCreateProjects ? (
              <Pressable
                accessibilityRole="button"
                onPress={openCreateDrawer}
                className="mt-4 rounded-full border border-accent/50 bg-accent/10 px-4 py-2"
              >
                <Text className="text-sm font-black text-accent dark:text-dark-accent">
                  Create your first project
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View className="gap-4">
            {filteredProjects.map((project) => {
              const role = getProjectMemberRole(project, user?.id);
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  canEdit={canEditProjectDetails(role)}
                  canDelete={!user?.isDemo && canDeleteProject(role)}
                  onEdit={openEditDrawer}
                  onOpen={(item) =>
                    router.push({ pathname: "/project/[id]", params: { id: item.id } })
                  }
                  onDelete={setDeleteTarget}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      <ProjectDrawer
        visible={drawerOpen}
        mode={drawerMode}
        project={editingProject}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setDrawerOpen(false);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmationPopup
        visible={Boolean(deleteTarget)}
        title="Delete project?"
        message="This permanently removes the project and all its tasks. Only the project owner can delete."
        confirmLabel={deleting ? "Deleting..." : "Delete project"}
        variant="danger"
        icon="trash-outline"
        loading={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
      />
    </View>
  );
}
