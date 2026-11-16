import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NotePin } from "@/components/NotePin";
import { useAppPalette } from "@/theme/useAppPalette";
import {
  checklistProgress,
  editedLabel,
  noteSurface,
  type Note,
} from "@/notes";

const VISIBLE_ITEMS = 3;

export function NoteCard({
  note,
  onPress,
  onLongPress,
  onToggleItem,
}: {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
  onToggleItem?: (note: Note, itemId: string) => void;
}) {
  const { dark, palette } = useAppPalette();
  const title = note.title?.trim();
  const body = note.body.trim();
  const hidden = Math.max(0, note.checklist.length - VISIBLE_ITEMS);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open note ${title || note.preview || "Untitled"}`}
      onPress={() => onPress(note)}
      onLongPress={onLongPress ? () => onLongPress(note) : undefined}
      delayLongPress={350}
      className="rounded-nova-xl border border-glass p-4 active:opacity-85 dark:border-dark-glass"
      style={{ backgroundColor: noteSurface(note.color, dark ? "dark" : "light") }}
    >
      {title ? (
        <Text numberOfLines={2} className="text-base font-black text-primary dark:text-dark-primary">
          {title}
        </Text>
      ) : null}
      {body ? (
        <Text
          numberOfLines={title ? 4 : 5}
          className={`text-sm leading-5 text-primary dark:text-dark-primary ${title ? "mt-1.5 opacity-75" : "opacity-90"}`}
        >
          {body}
        </Text>
      ) : null}

      {note.checklist.length > 0 ? (
        <View className={`gap-2 ${title || body ? "mt-3" : ""}`}>
          {note.checklist.slice(0, VISIBLE_ITEMS).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              disabled={!onToggleItem}
              onPress={() => onToggleItem?.(note, item.id)}
              hitSlop={6}
              className="flex-row items-center gap-2.5"
            >
              <Ionicons
                name={item.done ? "checkbox" : "square-outline"}
                size={20}
                color={item.done ? palette.accent : palette.muted}
              />
              <Text
                numberOfLines={1}
                className={`flex-1 text-sm text-primary dark:text-dark-primary ${item.done ? "line-through opacity-50" : ""}`}
              >
                {item.text}
              </Text>
            </Pressable>
          ))}
          {hidden > 0 ? (
            <Text className="pl-7 text-xs text-muted dark:text-dark-muted">+{hidden} more</Text>
          ) : null}
        </View>
      ) : null}

      <View className="mt-3 flex-row items-center gap-2">
        {note.pinned ? <NotePin size={14} color={palette.accent} /> : null}
        <Ionicons name="folder-open-outline" size={13} color={palette.muted} />
        <Text numberOfLines={1} className="flex-1 text-xs text-muted dark:text-dark-muted">
          {note.project?.name ?? "Personal"}
        </Text>
        <Text className="text-xs text-muted dark:text-dark-muted">
          {checklistProgress(note.checklist)}
          {note.checklist.length > 0 ? " · " : ""}
          {editedLabel(note.updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}
