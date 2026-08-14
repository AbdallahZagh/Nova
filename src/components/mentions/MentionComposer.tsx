import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAppPalette } from "@/theme/useAppPalette";
import {
  filterMentionUsers,
  insertMention,
  mentionQueryAtCaret,
  type MentionUser,
} from "@/mentions";

type MentionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
};

export function MentionComposer({
  value,
  onChange,
  users,
  placeholder,
  disabled,
  minHeight = 92,
}: MentionComposerProps) {
  const { palette } = useAppPalette();
  const [caret, setCaret] = useState(value.length);
  const active = mentionQueryAtCaret(value, caret);
  const suggestions = useMemo(
    () => (active ? filterMentionUsers(users, active.query) : []),
    [active, users],
  );

  const apply = (user: MentionUser) => {
    const next = insertMention(value, caret, user.username);
    onChange(next.value);
    setCaret(next.caret);
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={(next) => {
          onChange(next);
          setCaret(next.length);
        }}
        onSelectionChange={(event) => {
          setCaret(event.nativeEvent.selection.end);
        }}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        className="rounded-nova border border-glass bg-glass-button px-3.5 py-3 text-primary dark:border-dark-glass dark:bg-dark-glass-button dark:text-dark-primary"
        style={{ minHeight }}
      />
      {suggestions.length > 0 ? (
        <View className="mt-2 overflow-hidden rounded-nova border border-glass bg-sidebar dark:border-dark-glass dark:bg-dark-sidebar">
          {suggestions.map((user) => (
            <Pressable
              key={user.id}
              onPress={() => apply(user)}
              className="flex-row items-center justify-between gap-3 px-3 py-2.5"
            >
              <Text className="font-black text-primary dark:text-dark-primary">
                {user.fullName}
              </Text>
              <Text className="text-xs font-bold text-accent dark:text-dark-accent">
                {user.username}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
