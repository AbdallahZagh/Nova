import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import { createNoteApi, deleteNoteApi, listNotesApi, updateNoteApi } from "@/api/notes";
import { ActionSheet, type ActionSheetItem } from "@/components/ActionSheet";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { NoteCard } from "@/components/NoteCard";
import { NotePin } from "@/components/NotePin";
import { PageSkeleton } from "@/components/Skeleton";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import {
  filterNotes,
  noteTitle,
  searchNotes,
  sortNotes,
  upsertNote,
  type Note,
  type NoteScope,
} from "@/notes";
import { useAppPalette } from "@/theme/useAppPalette";

const SCOPES: { value: NoteScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "personal", label: "Personal" },
  { value: "project", label: "Projects" },
  { value: "pinned", label: "Pinned" },
];

export default function NotesScreen() {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<NoteScope>("all");
  const [query, setQuery] = useState("");
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  const load = useCallback(async () => {
    try {
      setNotes(sortNotes(await listNotesApi()));
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not load notes",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  // Reload whenever you come back from a note, so edits show up straight away.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(
    () => searchNotes(filterNotes(notes, scope), query),
    [notes, scope, query],
  );
  const pinned = visible.filter((note) => note.pinned);
  const others = visible.filter((note) => !note.pinned);
  const filtering = scope !== "all" || Boolean(query.trim());

  const counts = useMemo(
    () => ({
      all: notes.length,
      personal: filterNotes(notes, "personal").length,
      project: filterNotes(notes, "project").length,
      pinned: filterNotes(notes, "pinned").length,
    }),
    [notes],
  );

  const openNote = useCallback((note: Note) => {
    router.push(`/(main)/note/${note.id}` as never);
  }, []);

  const patch = useCallback(
    async (note: Note, input: Parameters<typeof updateNoteApi>[1]) => {
      try {
        const saved = await updateNoteApi(note.id, input);
        setNotes((current) => upsertNote(current, saved));
      } catch (error) {
        showSnackbar({
          variant: "error",
          title: "Could not update note",
          message: getApiErrorMessage(error, "Please try again."),
        });
        void load();
      }
    },
    [load, showSnackbar],
  );

  const toggleItem = useCallback(
    (note: Note, itemId: string) => {
      const checklist = note.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      );
      setNotes((current) =>
        current.map((item) => (item.id === note.id ? { ...item, checklist } : item)),
      );
      void patch(note, { checklist });
    },
    [patch],
  );

  const duplicate = useCallback(
    async (note: Note) => {
      try {
        const copy = await createNoteApi({
          title: note.title ? `${note.title} (copy)`.slice(0, 160) : null,
          body: note.body,
          checklist: note.checklist.map((item) => ({ ...item, id: `${item.id}-copy` })),
          color: note.color,
          projectId: note.projectId,
        });
        setNotes((current) => upsertNote(current, copy));
        showSnackbar({ variant: "success", title: "Note duplicated" });
      } catch (error) {
        showSnackbar({
          variant: "error",
          title: "Could not duplicate note",
          message: getApiErrorMessage(error, "Please try again."),
        });
      }
    },
    [showSnackbar],
  );

  const menuActions = useMemo<ActionSheetItem[]>(() => {
    if (!menuNote) return [];
    const note = menuNote;
    return [
      { key: "open", label: "Open", icon: "create-outline", onPress: () => openNote(note) },
      {
        key: "pin",
        label: note.pinned ? "Unpin" : "Pin to top",
        glyph: <NotePin pinned={note.pinned} size={18} color={palette.primary} />,
        onPress: () => void patch(note, { pinned: !note.pinned }),
      },
      {
        key: "duplicate",
        label: "Duplicate",
        icon: "copy-outline",
        onPress: () => void duplicate(note),
      },
      {
        key: "delete",
        label: "Delete",
        icon: "trash-outline",
        destructive: true,
        onPress: () => setDeleteTarget(note),
      },
    ];
  }, [duplicate, menuNote, openNote, palette.primary, patch]);

  if (loading) return <PageSkeleton />;

  return (
    <View className="flex-1 bg-main dark:bg-dark-main">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 p-5 pb-32"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[30px] font-black text-primary dark:text-dark-primary">Notes</Text>
            <Text className="text-sm text-muted dark:text-dark-muted">
              {visible.length} {visible.length === 1 ? "note" : "notes"}
              {filtering ? " found" : " · private to you"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New note"
            onPress={() => router.push("/(main)/note/new" as never)}
            className="h-12 w-12 items-center justify-center rounded-nova bg-accent active:opacity-85 dark:bg-dark-accent"
          >
            <Ionicons name="add" size={26} color={palette.white} />
          </Pressable>
        </View>

        <View className="min-h-[48px] flex-row items-center gap-2 rounded-nova border border-glass bg-glass-button px-3 dark:border-dark-glass dark:bg-dark-glass-button">
          <Ionicons name="search-outline" size={18} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            autoCorrect={false}
            className="flex-1 py-3 text-base text-primary dark:text-dark-primary"
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {SCOPES.map((item) => {
            const active = scope === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setScope(item.value)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${
                  active ? "border-accent bg-accent/15" : "border-glass dark:border-dark-glass"
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    active ? "text-accent dark:text-dark-accent" : "text-primary dark:text-dark-primary"
                  }`}
                >
                  {item.label}
                </Text>
                <Text className="text-xs font-bold text-muted dark:text-dark-muted">
                  {counts[item.value]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {visible.length === 0 ? (
          <View className="items-center rounded-nova-xl border border-dashed border-glass px-6 py-12 dark:border-dark-glass">
            <View className="h-14 w-14 items-center justify-center rounded-nova-xl bg-accent/15">
              <Ionicons name="document-text-outline" size={28} color={palette.accent} />
            </View>
            <Text className="mt-4 text-lg font-black text-primary dark:text-dark-primary">
              {filtering ? "No notes match" : "Capture your first note"}
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              {filtering
                ? "Try another search or filter."
                : "Write ideas, checklists and reminders. Attach one to a project when it belongs there."}
            </Text>
            {filtering ? (
              <Pressable
                onPress={() => {
                  setScope("all");
                  setQuery("");
                }}
                className="mt-4 rounded-nova border border-glass px-4 py-2.5 dark:border-dark-glass"
              >
                <Text className="font-black text-primary dark:text-dark-primary">Clear filters</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push("/(main)/note/new" as never)}
                className="mt-4 flex-row items-center gap-2 rounded-nova bg-accent px-4 py-3 dark:bg-dark-accent"
              >
                <Ionicons name="add" size={18} color={palette.white} />
                <Text className="font-black text-white">New note</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {pinned.length > 0 ? (
              <NoteSection
                title="Pinned"
                icon={<NotePin size={13} color={palette.muted} />}
                notes={pinned}
                onOpen={openNote}
                onMenu={setMenuNote}
                onToggle={toggleItem}
              />
            ) : null}
            {others.length > 0 ? (
              <NoteSection
                title={pinned.length > 0 ? "Others" : "Recent"}
                notes={others}
                onOpen={openNote}
                onMenu={setMenuNote}
                onToggle={toggleItem}
              />
            ) : null}
            <Text className="text-center text-xs text-subtle dark:text-dark-subtle">
              Hold a note for pin, duplicate and delete
            </Text>
          </>
        )}
      </ScrollView>

      <ActionSheet
        visible={Boolean(menuNote)}
        title={menuNote ? noteTitle(menuNote) : undefined}
        actions={menuActions}
        onClose={() => setMenuNote(null)}
      />
      <ConfirmationPopup
        visible={Boolean(deleteTarget)}
        title="Delete note?"
        message="This removes the note from your account."
        confirmLabel="Delete"
        variant="danger"
        icon="trash-outline"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) return;
          try {
            await deleteNoteApi(target.id);
            setNotes((current) => current.filter((item) => item.id !== target.id));
            showSnackbar({ variant: "success", title: "Note deleted" });
          } catch (error) {
            showSnackbar({
              variant: "error",
              title: "Could not delete note",
              message: getApiErrorMessage(error, "Please try again."),
            });
          }
        }}
      />
    </View>
  );
}

function NoteSection({
  title,
  icon,
  notes,
  onOpen,
  onMenu,
  onToggle,
}: {
  title: string;
  icon?: React.ReactNode;
  notes: Note[];
  onOpen: (note: Note) => void;
  onMenu: (note: Note) => void;
  onToggle: (note: Note, itemId: string) => void;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5">
        {icon ?? null}
        <Text className="text-xs font-black uppercase tracking-[1.2px] text-subtle dark:text-dark-subtle">
          {title}
        </Text>
        <Text className="text-xs font-bold text-muted dark:text-dark-muted">{notes.length}</Text>
      </View>
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onPress={onOpen}
          onLongPress={onMenu}
          onToggleItem={onToggle}
        />
      ))}
    </View>
  );
}
