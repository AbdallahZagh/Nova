import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { BottomDrawer } from "@/components/BottomDrawer";
import type { SelectFieldOption } from "@/components/SelectField";
import { getPalette } from "@/theme/colors";

type MultiSelectFieldProps = {
  label?: string;
  value: string[];
  options: SelectFieldOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function MultiSelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select...",
  title,
  subtitle,
  searchable = true,
  searchPlaceholder = "Search...",
  disabled = false,
}: MultiSelectFieldProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.filter((option) => value.includes(option.value));
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

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  const empty = options.length === 0;
  const triggerDisabled = disabled || empty;

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
        disabled={triggerDisabled}
        onPress={() => {
          if (!triggerDisabled) setOpen(true);
        }}
        className="min-h-[50px] flex-row items-center justify-between gap-3 rounded-nova border border-glass bg-glass-button px-3.5 py-3 active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
      >
        <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
          {empty ? (
            <Text className="text-[15px] font-black text-muted dark:text-dark-muted">
              No assignable members
            </Text>
          ) : selected.length === 0 ? (
            <Text className="text-[15px] font-black text-muted dark:text-dark-muted">
              {placeholder}
            </Text>
          ) : (
            selected.map((option) => (
              <View
                key={option.value}
                className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 dark:border-dark-accent/40 dark:bg-dark-accent/10"
              >
                <Text className="text-xs font-black text-accent dark:text-dark-accent">
                  {option.label}
                </Text>
              </View>
            ))
          )}
        </View>
        <Ionicons name="chevron-down-outline" size={18} color={palette.accent} />
      </Pressable>

      <BottomDrawer
        visible={open}
        title={title ?? label ?? "Select"}
        subtitle={
          subtitle ??
          (selected.length === 0
            ? "Choose one or more people."
            : `${selected.length} selected`)
        }
        onClose={close}
        footer={
          <Pressable
            accessibilityRole="button"
            onPress={close}
            className="min-h-[50px] items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
          >
            <Text className="font-black text-white">Done</Text>
          </Pressable>
        }
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
              const active = value.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => toggle(option.value)}
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
                  ) : (
                    <View className="h-[18px] w-[18px] rounded-full border border-glass dark:border-dark-glass" />
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomDrawer>
    </View>
  );
}
