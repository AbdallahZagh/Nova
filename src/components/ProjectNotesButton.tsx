import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { getApiErrorMessage } from "@/api/apiClient";
import { createNoteApi, listNotesApi } from "@/api/notes";
import { BottomDrawer } from "@/components/BottomDrawer";
import { NoteCard } from "@/components/NoteCard";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { sortNotes, upsertNote, type Note } from "@/notes";
import { useAppPalette } from "@/theme/useAppPalette";

/** Everything you have written about this project. Notes stay private to you. */
export function ProjectNotesButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName?: string;
}) {
  const { palette } = useAppPalette();
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(sortNotes(await listNotesApi({ projectId })));
    } catch {
      setNotes([]);
    }
  }, [projectId]);

  // Keeps the count right when you return from writing a note.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function quickAdd() {
    const body = draft.trim();
    if (!body || adding) return;
    setAdding(true);
    try {
      const created = await createNoteApi({ body, projectId, color: "AMBER" });
      setNotes((current) => upsertNote(current, created));
      setDraft("");
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Could not add note",
        message: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setAdding(false);
    }
  }

  function openNote(note: Note) {
    setOpen(false);
    router.push(`/(main)/note/${note.id}` as never);
  }

  function writeFullNote() {
    setOpen(false);
    router.push(`/(main)/note/new?projectId=${projectId}` as never);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open my notes for this project"
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1.5 rounded-full border border-glass px-3 py-1.5 dark:border-dark-glass"
      >
        <Ionicons name="document-text-outline" size={13} color={palette.accent} />
        <Text className="text-xs font-black text-primary dark:text-dark-primary">
          My notes{notes.length > 0 ? ` · ${notes.length}` : ""}
        </Text>
      </Pressable>

      <BottomDrawer
        visible={open}
        title="My notes"
        subtitle={projectName ? `Private notes about ${projectName}` : "Private notes about this project"}
        onClose={() => setOpen(false)}
        maxHeight="92%"
      >
        <View className="flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Jot something down"
            placeholderTextColor={palette.muted}
            returnKeyType="done"
            onSubmitEditing={() => void quickAdd()}
            className="min-h-[48px] flex-1 rounded-nova border border-glass bg-glass-button px-3 text-base text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add note"
            disabled={!draft.trim() || adding}
            onPress={() => void quickAdd()}
            className="h-12 w-12 items-center justify-center rounded-nova bg-accent active:opacity-85 disabled:opacity-40 dark:bg-dark-accent"
          >
            <Ionicons name="arrow-up" size={20} color={palette.white} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={writeFullNote}
          className="flex-row items-center gap-2 self-start"
        >
          <Ionicons name="create-outline" size={16} color={palette.accent} />
          <Text className="text-sm font-black text-accent dark:text-dark-accent">
            Write a full note
          </Text>
        </Pressable>

        {notes.length === 0 ? (
          <View className="items-center rounded-nova-xl border border-dashed border-glass px-5 py-10 dark:border-dark-glass">
            <Ionicons name="document-text-outline" size={26} color={palette.accent} />
            <Text className="mt-3 font-black text-primary dark:text-dark-primary">
              No notes on this project yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted dark:text-dark-muted">
              Use the box above for a quick thought, or write a full note with a checklist.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} onPress={openNote} />
            ))}
          </View>
        )}
      </BottomDrawer>
    </>
  );
}
