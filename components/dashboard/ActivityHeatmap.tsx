"use client";

import { useCallback, useMemo, useState } from "react";
import type { ActivityMap } from "@/lib/api/dashboard";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

type CellData = {
  date: Date;
  isCurrentYear: boolean;
  count: number;
  tasks: { title: string; project: string; progress: number }[];
};

type TooltipState = { cell: CellData; rect: DOMRect } | null;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildHeatmap(activity: ActivityMap) {
  const year = new Date().getFullYear();
  const taskMap = new Map<string, { title: string; project: string; progress: number }[]>();

  for (const [isoKey, entries] of Object.entries(activity)) {
    if (!entries?.length) continue;
    const d = new Date(isoKey);
    if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    taskMap.set(
      isoKey,
      entries.map((task) => ({
        title: task.title,
        project: task.projectName,
        progress: Math.round(task.completionPercentage),
      })),
    );
  }

  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - (dow === 0 ? 6 : dow - 1));

  const dec31 = new Date(year, 11, 31);
  const dec31dow = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(gridEnd.getDate() + (dec31dow === 0 ? 0 : 7 - dec31dow));

  const weeks: CellData[][] = [];
  const monthCols: { label: string; col: number }[] = [];
  const seenMonths = new Set<number>();
  const cursor = new Date(gridStart);
  let col = 0;

  while (cursor <= gridEnd) {
    const week: CellData[] = [];
    for (let row = 0; row < 7; row++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + row);
      const isCurrentYear = d.getFullYear() === year;
      const key = toDateKey(d);
      const tasks = taskMap.get(key) ?? [];

      if (isCurrentYear && row === 0 && !seenMonths.has(d.getMonth())) {
        seenMonths.add(d.getMonth());
        monthCols.push({ label: MONTH_NAMES[d.getMonth()], col });
      }

      week.push({ date: new Date(d), isCurrentYear, count: tasks.length, tasks });
    }
    weeks.push(week);
    col++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return { weeks, monthCols };
}

export function ActivityHeatmap({ activity }: { activity: ActivityMap }) {
  const { weeks, monthCols } = useMemo(() => buildHeatmap(activity), [activity]);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const totalTasks = useMemo(
    () => weeks.flat().reduce((total, cell) => total + cell.tasks.length, 0),
    [weeks],
  );
  const nWeeks = weeks.length;

  const handleEnter = useCallback((cell: CellData, e: React.MouseEvent) => {
    if (!cell.isCurrentYear) return;
    setTooltip({ cell, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
  }, []);

  const tooltipStyle = tooltip
    ? (() => {
        const centerX = tooltip.rect.left + tooltip.rect.width / 2;
        const width = 220;
        return {
          left: Math.max(width / 2 + 8, Math.min(centerX, window.innerWidth - width / 2 - 8)),
          top: tooltip.rect.top - 10,
          transform: "translate(-50%, -100%)",
        };
      })()
    : {};

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-primary/40">
          {totalTasks} task{totalTasks !== 1 ? "s" : ""} scheduled in {new Date().getFullYear()}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-primary/40">
          <span>Less</span>
          {[0.08, 0.28, 0.52, 0.76, 1].map((opacity) => (
            <div key={opacity} className="size-[10px] rounded-sm bg-accent" style={{ opacity }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="relative mb-1 ml-7 h-[14px]">
        {monthCols.map(({ label, col }) => (
          <span key={`${label}-${col}`} className="absolute text-[10px] text-primary/40" style={{ left: `${(col / nWeeks) * 100}%` }}>
            {label}
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <div className="flex w-6 shrink-0 flex-col gap-[3px]">
          {DAY_LABELS.map((label, index) => (
            <div key={index} className="flex flex-1 items-center text-[10px] text-primary/35">
              {label}
            </div>
          ))}
        </div>

        <div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${nWeeks}, 1fr)` }}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((cell, dayIndex) => (
                <button
                  key={dayIndex}
                  type="button"
                  aria-label={cell.isCurrentYear ? toDateKey(cell.date) : undefined}
                  className="relative aspect-square w-full rounded-[2px] bg-accent transition-transform hover:z-10 hover:scale-[1.25]"
                  style={{
                    opacity: !cell.isCurrentYear
                      ? 0
                      : cell.count === 0
                        ? 0.08
                        : cell.count === 1
                          ? 0.28
                          : cell.count === 2
                            ? 0.52
                            : cell.count === 3
                              ? 0.76
                              : 1,
                    pointerEvents: cell.isCurrentYear ? undefined : "none",
                  }}
                  onMouseEnter={(e) => handleEnter(cell, e)}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-300 w-[210px] rounded-xl border border-glass bg-sidebar px-3 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-2xl"
          style={tooltipStyle}
        >
          <p className="text-[11px] font-semibold text-primary/50">
            {tooltip.cell.date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>

          {tooltip.cell.tasks.length > 0 ? (
            <div className="mt-2 space-y-2.5">
              {tooltip.cell.tasks.map((task, index) => (
                <div key={index}>
                  <p className="text-xs font-semibold leading-snug text-primary">{task.title}</p>
                  <p className="mt-0.5 text-[10px] text-primary/50">{task.project}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="text-[10px] font-medium text-accent">{task.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-primary/35">No activity</p>
          )}
        </div>
      )}
    </div>
  );
}
