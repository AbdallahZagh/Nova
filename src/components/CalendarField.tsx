import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "nativewind";
import { BottomDrawer } from "@/components/BottomDrawer";
import { getPalette } from "@/theme/colors";

type CalendarFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minimumDate?: string;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDisplayDate(value: string) {
  const date = parseDateKey(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function CalendarField({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  minimumDate,
}: CalendarFieldProps) {
  const { colorScheme } = useColorScheme();
  const palette = getPalette(colorScheme);
  const selectedDate = parseDateKey(value);
  const minimum = parseDateKey(minimumDate);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => selectedDate ?? new Date(),
  );

  const todayKey = toDateKey(new Date());
  const selectedKey = selectedDate ? toDateKey(selectedDate) : "";

  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toDateKey(date);
      return {
        date,
        key,
        isCurrentMonth: sameMonth(date, visibleMonth),
        isSelected: key === selectedKey,
        isToday: key === todayKey,
        isDisabled: minimum ? date < minimum : false,
      };
    });
  }, [minimum, selectedKey, todayKey, visibleMonth]);

  const moveMonth = (offset: number) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const chooseDate = (date: Date) => {
    onChange(toDateKey(date));
    setOpen(false);
  };

  const openCalendar = () => {
    if (disabled) return;
    setVisibleMonth(selectedDate ?? new Date());
    setOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open calendar"
        disabled={disabled}
        onPress={openCalendar}
        className="min-h-[50px] flex-row items-center justify-between gap-3 rounded-nova border border-glass bg-glass-button px-3.5 py-3 active:opacity-75 disabled:opacity-50 dark:border-dark-glass dark:bg-dark-glass-button"
      >
        <Text
          className={`flex-1 text-[15px] ${
            value
              ? "text-primary dark:text-dark-primary"
              : "text-muted dark:text-dark-muted"
          }`}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={palette.accent} />
      </Pressable>

      <BottomDrawer
        visible={open}
        title="Select Date"
        subtitle="Pick a due date for this task."
        onClose={() => setOpen(false)}
      >
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => moveMonth(-1)}
              className="h-11 w-11 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="chevron-back" size={20} color={palette.primary} />
            </Pressable>

            <Text className="text-[18px] font-black text-primary dark:text-dark-primary">
              {monthNames[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => moveMonth(1)}
              className="h-11 w-11 items-center justify-center rounded-full border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
            >
              <Ionicons name="chevron-forward" size={20} color={palette.primary} />
            </Pressable>
          </View>

          <View className="rounded-nova-xl border border-glass bg-glass-card p-3 dark:border-dark-glass dark:bg-dark-glass-card">
            <View className="mb-2 flex-row">
              {weekDays.map((day) => (
                <Text
                  key={day}
                  className="flex-1 text-center text-[11px] font-black uppercase text-muted dark:text-dark-muted"
                >
                  {day}
                </Text>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {calendarDays.map((item) => (
                <View key={item.key} className="w-[14.2857%] p-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.key}
                    disabled={item.isDisabled}
                    onPress={() => chooseDate(item.date)}
                    className={`aspect-square items-center justify-center rounded-full border disabled:opacity-30 ${
                      item.isSelected
                        ? "border-accent bg-accent dark:border-dark-accent dark:bg-dark-accent"
                        : item.isToday
                          ? "border-accent/60 bg-accent/10 dark:border-dark-accent/60 dark:bg-dark-accent/10"
                          : "border-transparent bg-transparent"
                    }`}
                  >
                    <Text
                      className={`text-sm font-extrabold ${
                        item.isSelected
                          ? "text-white"
                          : item.isCurrentMonth
                            ? "text-primary dark:text-dark-primary"
                            : "text-subtle dark:text-dark-subtle"
                      }`}
                    >
                      {item.date.getDate()}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const today = new Date();
                setVisibleMonth(today);
                chooseDate(today);
              }}
              className="min-h-[48px] flex-1 items-center justify-center rounded-nova border border-glass bg-glass-card dark:border-dark-glass dark:bg-dark-glass-card"
            >
              <Text className="text-sm font-black text-primary dark:text-dark-primary">
                Today
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
              className="min-h-[48px] flex-1 items-center justify-center rounded-nova bg-accent dark:bg-dark-accent"
            >
              <Text className="text-sm font-black text-white">Clear</Text>
            </Pressable>
          </View>
        </View>
      </BottomDrawer>
    </>
  );
}
