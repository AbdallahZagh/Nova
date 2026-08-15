import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { BottomDrawer } from "@/components/BottomDrawer";
import { getPalette } from "@/theme/colors";

export type SelectFieldOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectFieldProps = {
  label?: string;
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select...",
  title,
  subtitle,
  searchable = false,
  searchPlaceholder = "Search...",
  disabled = false,
}: SelectFieldProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    if (!searchable) return options;
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query, searchable]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View>
      {label ? (
        <Text className="mb-2 text-[11px] font-black uppercase tracking-[1.2px] text-muted dark:text-dark-muted">
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? title ?? "Open options"}
        disabled={disabled}
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        className="min-h-[50px] flex-row items-center justify-between gap-3 rounded-nova border border-glass bg-glass-button px-3.5 py-3 active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
      >
        <Text
          numberOfLines={1}
          className={`flex-1 text-[15px] font-black ${
            selected
              ? "text-primary dark:text-dark-primary"
              : "text-muted dark:text-dark-muted"
          }`}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down-outline" size={18} color={palette.accent} />
      </Pressable>

      <BottomDrawer
        visible={open}
        title={title ?? label ?? "Select"}
        subtitle={subtitle}
        onClose={close}
      >
        <View className="gap-2">
          {searchable ? (
            <View className="mb-1 flex-row items-center gap-2 rounded-nova border border-glass bg-glass-button px-3 dark:border-dark-glass dark:bg-dark-glass-button">
              <Ionicons name="search-outline" size={18} color={palette.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={palette.muted}
                autoFocus
                className="min-h-[46px] flex-1 text-[15px] text-primary dark:text-dark-primary"
              />
            </View>
          ) : null}
          {visibleOptions.length === 0 ? (
            <Text className="py-6 text-center text-sm font-bold text-muted dark:text-dark-muted">
              No matches
            </Text>
          ) : (
            visibleOptions.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={`flex-row items-center gap-3 rounded-nova border p-4 active:opacity-75 ${
                    active
                      ? "border-accent bg-accent/15 dark:border-dark-accent dark:bg-dark-accent/15"
                      : "border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
                  }`}
                >
                  <View className="flex-1">
                    <Text className="font-black text-primary dark:text-dark-primary">
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text className="mt-1 text-sm text-muted dark:text-dark-muted">
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={palette.accent} />
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomDrawer>
    </View>
  );
}
