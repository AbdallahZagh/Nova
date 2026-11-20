import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import { createNoteApi, getNoteApi } from "@/api/notes";
import { listProjectsApi } from "@/api/projects";
import { createTaskApi } from "@/api/tasks";
import { ActionSheet, type ActionSheetItem } from "@/components/ActionSheet";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { NoteColorDots } from "@/components/NoteColorDots";
import { NotePin } from "@/components/NotePin";
import { SelectField } from "@/components/SelectField";
import { NoteDetailSkeleton } from "@/components/Skeleton";
import { useNoteDraft } from "@/hooks/useNoteDraft";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { editedLabel, newChecklistItem, noteSurface, noteTitle, type Note } from "@/notes";
import { useAppPalette } from "@/theme/useAppPalette";

type ProjectOption = { id: string; title: string };

export default function NoteScreen() {
  const params = useLocalSearchParams<{ id?: string; projectId?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawProject = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const isNew = !rawId || rawId === "new";
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const { dark } = useAppPalette();
  const [note, setNote] = useState<Note | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loaded, projectItems] = await Promise.all([
          isNew ? Promise.resolve(null) : getNoteApi(rawId as string),
          listProjectsApi(),
        ]);
        if (cancelled) return;
        setNote(loaded);
        setProjects(projectItems.map((project) => ({ id: project.id, title: project.title })));
      } catch (error) {
        if (cancelled) return;
        if (isNew) {
          setProjects([]);
        } else {
          setMissing(true);
          showSnackbar({
            variant: "error",
            title: "Could not open note",
            message: getApiErrorMessage(error, "It may have been deleted."),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, rawId, showSnackbar]);

  if (loading) return <NoteDetailSkeleton />;

  if (missing) {
    return (
      <View className="flex-1 items-center justify-center bg-main p-6 dark:bg-dark-main">
        <Text className="text-xl font-black text-primary dark:text-dark-primary">Note not found</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-nova bg-accent px-4 py-3 dark:bg-dark-accent"
        >
          <Text className="font-black text-white">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <NoteEditor
      key={note?.id ?? "new"}
      note={note}
      projects={projects}
      defaultProjectId={rawProject}
      mode={dark ? "dark" : "light"}
    />
  );
}

function NoteEditor({
  note,
  projects,
  defaultProjectId,
  mode,
}: {
  note: Note | null;
  projects: ProjectOption[];
  defaultProjectId?: string;
  mode: "light" | "dark";
}) {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const { fields, saved, noteId, status, errorMessage, set, flush, remove } = useNoteDraft({
    note,
    defaults: { projectId: defaultProjectId },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const [bodyHeight, setBodyHeight] = useState(140);
  const checklistRef = useRef(fields.checklist);
  checklistRef.current = fields.checklist;

  function addChecklistItem(afterIndex?: number) {
    const next = newChecklistItem();
    const current = checklistRef.current;
    const copy = [...current];
    copy.splice(afterIndex === undefined ? current.length : afterIndex + 1, 0, next);
    setFocusItem(next.id);
    set({ checklist: copy });
  }

  const projectName = projects.find((project) => project.id === fields.projectId)?.title;
  const surface = noteSurface(fields.color, mode);
  const isSaved = Boolean(noteId);

  async function leave() {
    await flush();
    router.back();
  }

  async function convertToTask() {
    if (!fields.projectId) {
      showSnackbar({ variant: "error", title: "Pick a project first" });
      return;
    }
    try {
      await flush();
      await createTaskApi(fields.projectId, {
        title: fields.title.trim() || noteTitle({ title: null, preview: fields.body.trim() }),
        description: fields.body,
        priority: "Medium",
        status: "To Do",
        assigneeIds: [],
        dueDate: "",
        subtasks: fields.checklist
          .filter((item) => item.text.trim())
          .map((item) => ({ id: item.id, label: item.text, done: item.done })),
      });
      showSnackbar({
        variant: "success",
        title: "Task created",
        message: projectName ? `Added to ${projectName}. The note is still here.` : undefined,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not create the task",
        message: getApiErrorMessage(error, "Please try again."),
      });
    }
  }

  async function duplicate() {
    if (!saved) return;
    try {
      await flush();
      await createNoteApi({
        title: saved.title ? `${saved.title} (copy)` : null,
        body: fields.body,
        checklist: fields.checklist.filter((item) => item.text.trim()),
        color: fields.color,
        projectId: fields.projectId || null,
      });
      showSnackbar({ variant: "success", title: "Note duplicated" });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not duplicate note",
        message: getApiErrorMessage(error, "Please try again."),
      });
    }
  }

  const actions = useMemo<ActionSheetItem[]>(() => {
    const items: ActionSheetItem[] = [
      {
        key: "pin",
        label: fields.pinned ? "Unpin" : "Pin to top",
        glyph: <NotePin pinned={fields.pinned} size={18} color={palette.primary} />,
        onPress: () => set({ pinned: !fields.pinned }),
      },
    ];
    if (isSaved) {
      items.push({
        key: "duplicate",
        label: "Duplicate",
        icon: "copy-outline",
        onPress: () => void duplicate(),
      });
    }
    if (isSaved && fields.projectId) {
      items.push({
        key: "task",
        label: "Turn into a task",
        icon: "checkmark-done-outline",
        onPress: () => void convertToTask(),
      });
    }
    if (isSaved) {
      items.push({
        key: "delete",
        label: "Delete note",
        icon: "trash-outline",
        destructive: true,
        onPress: () => setConfirmDelete(true),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.pinned, fields.projectId, fields.title, fields.body, fields.checklist, isSaved, saved]);

  const done = fields.checklist.filter((item) => item.done).length;

  return (
    <View className="flex-1" style={{ backgroundColor: surface }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 p-5 pb-12"
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => void leave()}
            className="h-10 w-10 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="chevron-back-outline" size={18} color={palette.accent} />
          </Pressable>
          <Text
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            className={`flex-1 text-xs font-bold ${
              status === "error" ? "text-danger dark:text-dark-danger" : "text-muted dark:text-dark-muted"
            }`}
          >
            {status === "saving"
              ? "Saving…"
              : status === "error"
                ? errorMessage || "Could not save"
                : saved
                  ? `Saved · edited ${editedLabel(saved.updatedAt)}`
                  : "Saves automatically as you write"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fields.pinned ? "Unpin note" : "Pin note"}
            onPress={() => set({ pinned: !fields.pinned })}
            className="h-10 w-10 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <NotePin
              pinned={fields.pinned}
              size={18}
              color={fields.pinned ? palette.accent : palette.muted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More actions"
            onPress={() => setMenuOpen(true)}
            className="h-10 w-10 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={palette.muted} />
          </Pressable>
        </View>

        <TextInput
          value={fields.title}
          onChangeText={(title) => set({ title })}
          placeholder="Title"
          placeholderTextColor={palette.muted}
          multiline
          blurOnSubmit
          autoFocus={!note}
          className="text-[26px] font-black leading-8 text-primary dark:text-dark-primary"
        />

        <TextInput
          value={fields.body}
          onChangeText={(body) => set({ body })}
          placeholder="Start writing…"
          placeholderTextColor={palette.muted}
          multiline
          textAlignVertical="top"
          scrollEnabled={bodyHeight >= 220}
          onContentSizeChange={(event) => {
            const next = Math.min(
              220,
              Math.max(140, Math.ceil(event.nativeEvent.contentSize.height)),
            );
            setBodyHeight((current) => (current === next ? current : next));
          }}
          style={{ height: bodyHeight }}
          className="text-base leading-6 text-primary dark:text-dark-primary"
        />

        <View className="gap-2">
          {fields.checklist.length > 0 ? (
            <View className="mb-1 flex-row items-center gap-3">
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
                <View
                  className="h-full rounded-full bg-accent dark:bg-dark-accent"
                  style={{ width: `${(done / fields.checklist.length) * 100}%` }}
                />
              </View>
              <Text className="text-xs font-black text-muted dark:text-dark-muted">
                {done}/{fields.checklist.length}
              </Text>
            </View>
          ) : null}
          {fields.checklist.map((item, index) => (
            <View key={item.id} className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                onPress={() =>
                  set({
                    checklist: fields.checklist.map((entry) =>
                      entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                    ),
                  })
                }
                hitSlop={8}
              >
                <Ionicons
                  name={item.done ? "checkbox" : "square-outline"}
                  size={24}
                  color={item.done ? palette.accent : palette.muted}
                />
              </Pressable>
              <TextInput
                value={item.text}
                autoFocus={item.id === focusItem}
                onChangeText={(text) =>
                  set({
                    checklist: fields.checklist.map((entry) =>
                      entry.id === item.id ? { ...entry, text } : entry,
                    ),
                  })
                }
                onSubmitEditing={() => {
                  if (!item.text.trim()) return;
                  addChecklistItem(index);
                }}
                blurOnSubmit={false}
                returnKeyType="next"
                placeholder="List item"
                placeholderTextColor={palette.muted}
                style={{ minHeight: 40 }}
                className={`min-h-10 flex-1 py-2 text-base text-primary dark:text-dark-primary ${item.done ? "line-through opacity-50" : ""}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                hitSlop={8}
                onPress={() =>
                  set({ checklist: fields.checklist.filter((entry) => entry.id !== item.id) })
                }
              >
                <Ionicons name="close" size={18} color={palette.muted} />
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fields.checklist.length ? "Add item" : "Add a checklist"}
            onPress={() => addChecklistItem()}
            hitSlop={8}
            className="z-10 mt-2 min-h-11 flex-row items-center gap-2 self-start rounded-nova border border-glass bg-glass-button px-3 active:opacity-80 dark:border-dark-glass dark:bg-dark-glass-button"
          >
            <Ionicons name="add" size={16} color={palette.accent} />
            <Text className="text-sm font-black text-accent dark:text-dark-accent">
              {fields.checklist.length ? "Add item" : "Add a checklist"}
            </Text>
          </Pressable>
        </View>

        <View className="gap-3">
          <Text className="text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
            Colour
          </Text>
          <NoteColorDots value={fields.color} onChange={(color) => set({ color })} />
        </View>

        <SelectField
          label="Project"
          value={fields.projectId}
          onChange={(projectId) => set({ projectId })}
          options={[
            { value: "", label: "Personal (no project)" },
            ...projects.map((project) => ({ value: project.id, label: project.title })),
          ]}
          title="Attach to a project"
          searchable={projects.length > 6}
        />

        {isSaved && fields.projectId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void convertToTask()}
            className="min-h-[50px] flex-row items-center justify-center gap-2 rounded-nova border border-glass dark:border-dark-glass"
          >
            <Ionicons name="checkmark-done-outline" size={18} color={palette.accent} />
            <Text className="font-black text-primary dark:text-dark-primary">Turn into a task</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={menuOpen}
        title="Note"
        actions={actions}
        onClose={() => setMenuOpen(false)}
      />
      <ConfirmationPopup
        visible={confirmDelete}
        title="Delete note?"
        message="This removes the note from your account."
        confirmLabel="Delete"
        variant="danger"
        icon="trash-outline"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          if (await remove()) {
            showSnackbar({ variant: "success", title: "Note deleted" });
            router.back();
          }
        }}
      />
    </View>
  );
}
