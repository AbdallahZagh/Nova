import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ApiUserActivityTask } from "@/api/types";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"] as const;

type HeatmapTask = {
  title: string;
  project: string;
  progress: number;
};

type HeatmapCell = {
  key: string;
  date: Date;
  isCurrentYear: boolean;
  count: number;
  tasks: HeatmapTask[];
};

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildHeatmap(activity?: Record<string, ApiUserActivityTask[]>) {
  const year = new Date().getFullYear();
  const taskMap = new Map<string, HeatmapTask[]>();

  for (const [isoKey, entries] of Object.entries(activity ?? {})) {
    if (!entries?.length) continue;
    const date = new Date(isoKey);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;
    taskMap.set(
      isoKey,
      entries.map((task) => ({
        title: task.title,
        project: task.projectName,
        progress: Math.round(task.completionPercentage ?? 0),
      })),
    );
  }

  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay();
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - (startDay === 0 ? 6 : startDay - 1));

  const dec31 = new Date(year, 11, 31);
  const endDay = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(gridEnd.getDate() + (endDay === 0 ? 0 : 7 - endDay));

  const weeks: HeatmapCell[][] = [];
  const monthCols: { label: string; col: number }[] = [];
  const seenMonths = new Set<number>();
  const cursor = new Date(gridStart);
  let col = 0;

  while (cursor <= gridEnd) {
    const week: HeatmapCell[] = [];
    for (let row = 0; row < 7; row++) {
      const date = new Date(cursor);
      date.setDate(date.getDate() + row);
      const isCurrentYear = date.getFullYear() === year;
      const key = toDateKey(date);
      const tasks = taskMap.get(key) ?? [];

      if (isCurrentYear && row === 0 && !seenMonths.has(date.getMonth())) {
        seenMonths.add(date.getMonth());
        monthCols.push({ label: monthNames[date.getMonth()], col });
      }

      week.push({
        key,
        date,
        isCurrentYear,
        count: tasks.length,
        tasks,
      });
    }
    weeks.push(week);
    col++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return { weeks, monthCols, year };
}

function heatmapOpacity(count: number) {
  if (count === 0) return 0.08;
  if (count === 1) return 0.28;
  if (count === 2) return 0.52;
  if (count === 3) return 0.76;
  return 1;
}

export function ActivityHeatmap({
  activity,
}: {
  activity?: Record<string, ApiUserActivityTask[]>;
}) {
  const { weeks, monthCols, year } = useMemo(
    () => buildHeatmap(activity),
    [activity],
  );
  const firstActiveCell = useMemo(
    () =>
      weeks
        .flat()
        .filter((cell) => cell.isCurrentYear && cell.tasks.length > 0)
        .sort((a, b) => b.key.localeCompare(a.key))[0] ?? null,
    [weeks],
  );
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const activeCell = selected ?? firstActiveCell;
  const totalTasks = useMemo(
    () => weeks.flat().reduce((total, cell) => total + cell.tasks.length, 0),
    [weeks],
  );

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-subtle dark:text-dark-subtle">
          {totalTasks} task{totalTasks === 1 ? "" : "s"} scheduled in {year}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[10px] text-subtle dark:text-dark-subtle">
            Less
          </Text>
          {[0.08, 0.28, 0.52, 0.76, 1].map((opacity) => (
            <View
              key={opacity}
              className="h-[10px] w-[10px] rounded-[3px] bg-accent dark:bg-dark-accent"
              style={{ opacity }}
            />
          ))}
          <Text className="text-[10px] text-subtle dark:text-dark-subtle">
            More
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="pb-1"
      >
        <View>
          <View className="relative mb-1 ml-8 h-[16px]">
            {monthCols.map(({ label, col }) => (
              <Text
                key={`${label}-${col}`}
                className="absolute text-[10px] text-subtle dark:text-dark-subtle"
                style={{ left: col * 13 }}
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row gap-1.5">
            <View className="w-6 gap-[3px]">
              {dayLabels.map((label, index) => (
                <View key={`${label}-${index}`} className="h-[10px] justify-center">
                  <Text className="text-[9px] text-subtle dark:text-dark-subtle">
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row gap-[3px]">
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} className="gap-[3px]">
                  {week.map((cell) => {
                    const selectedCell = activeCell?.key === cell.key;
                    return (
                      <Pressable
                        key={cell.key}
                        accessibilityRole="button"
                        accessibilityLabel={cell.isCurrentYear ? cell.key : undefined}
                        disabled={!cell.isCurrentYear}
                        onPress={() => setSelected(cell)}
                        className={`h-6 w-6 rounded-md bg-accent dark:bg-dark-accent ${
                          selectedCell ? "border border-primary dark:border-dark-primary" : ""
                        }`}
                        style={{
                          opacity: cell.isCurrentYear
                            ? heatmapOpacity(cell.count)
                            : 0,
                        }}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="mt-4 rounded-nova border border-glass bg-glass-card p-4 dark:border-dark-glass dark:bg-dark-glass-card">
        <Text className="text-xs font-black uppercase tracking-[1.4px] text-subtle dark:text-dark-subtle">
          {activeCell
            ? activeCell.date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : "No activity"}
        </Text>

        {activeCell?.tasks.length ? (
          <View className="mt-3 gap-3">
            {activeCell.tasks.map((task, index) => (
              <View key={`${task.title}-${index}`}>
                <Text className="font-extrabold text-primary dark:text-dark-primary">
                  {task.title}
                </Text>
                <Text className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                  {task.project}
                </Text>
                <View className="mt-2 flex-row items-center gap-2">
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-glass-button dark:bg-dark-glass-button">
                    <View
                      className="h-full rounded-full bg-accent dark:bg-dark-accent"
                      style={{
                        width: `${Math.max(0, Math.min(100, task.progress))}%`,
                      }}
                    />
                  </View>
                  <Text className="text-xs font-black text-accent dark:text-dark-accent">
                    {task.progress}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-2 text-sm text-muted dark:text-dark-muted">
            No activity for this day.
          </Text>
        )}
      </View>
    </View>
  );
}
