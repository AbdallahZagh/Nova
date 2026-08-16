"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { TimelineFilter, TimelineTask } from "@/lib/api/timeline";
import {
  WEEKDAYS,
  STATUS_DOT,
  sod,
  dayOffset,
  dateKey,
  eachDay,
  monthGrid,
  normStatus,
  formatDayLabel,
  groupByDueDay,
  tipStyle,
} from "@/lib/timeline/layout";

export type DayTip = { date: Date; tasks: TimelineTask[]; rect: DOMRect };

function DayTaskRow({
  task,
  onOpen,
}: {
  task: TimelineTask;
  onOpen: (task: TimelineTask) => void;
}) {
  const status = normStatus(task.status);
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="block w-full rounded-lg px-2 py-2 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <p className="text-xs font-semibold leading-snug text-primary">{task.title}</p>
      <p className="mt-0.5 text-[10px] text-primary/50">{task.project.name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
        <span className="text-[10px] font-medium text-primary/55">{status}</span>
        {task.overdue && status !== "Completed" ? (
          <span className="text-[10px] font-semibold text-danger">Overdue</span>
        ) : null}
      </div>
    </button>
  );
}

function DayTooltip({
  tip,
  interactive,
  onOpen,
  onClose,
}: {
  tip: DayTip;
  interactive?: boolean;
  onOpen: (task: TimelineTask) => void;
  onClose?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interactive) return;
    const onDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [interactive, onClose]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-300 w-60 rounded-xl border border-glass bg-sidebar px-2 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-2xl",
        !interactive && "pointer-events-none",
      )}
      style={tipStyle(tip.rect)}
    >
      <p className="px-2 text-[11px] font-semibold text-primary/50">
        {formatDayLabel(tip.date)}
      </p>
      {tip.tasks.length === 0 ? (
        <p className="mt-1 px-2 text-[11px] text-primary/35">No tasks</p>
      ) : interactive ? (
        <div className="mt-1">
          {tip.tasks.map((task) => (
            <DayTaskRow key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2 px-2">
          {tip.tasks.map((task) => (
            <div key={task.id}>
              <p className="text-xs font-semibold leading-snug text-primary">
                {task.title}
              </p>
              <p className="mt-0.5 text-[10px] text-primary/50">
                {task.project.name} · {normStatus(task.status)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarCell({
  date,
  tasks,
  inMonth = true,
  compact,
  selected,
  onHover,
  onLeave,
  onSelect,
}: {
  date: Date;
  tasks: TimelineTask[];
  inMonth?: boolean;
  compact?: boolean;
  selected?: boolean;
  onHover: (tip: DayTip) => void;
  onLeave: () => void;
  onSelect: (tip: DayTip) => void;
}) {
  const isToday = dayOffset(date, sod(new Date())) === 0;
  const count = tasks.length;

  const emit = (event: React.MouseEvent, fn: (tip: DayTip) => void) => {
    if (!inMonth) return;
    fn({
      date,
      tasks,
      rect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
    });
  };

  return (
    <button
      type="button"
      disabled={!inMonth}
      onMouseEnter={(e) => emit(e, onHover)}
      onMouseLeave={onLeave}
      onClick={(e) => emit(e, onSelect)}
      aria-label={`${formatDayLabel(date)}${count ? `, ${count} tasks` : ""}`}
      className={cn(
        "flex flex-col border-r border-b border-glass/70 p-1.5 text-left transition",
        compact ? "min-h-16" : "min-h-20",
        inMonth ? "hover:bg-glass-button/60" : "pointer-events-none opacity-35",
        isToday && "bg-accent/10",
        selected && "ring-1 ring-inset ring-accent/70",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-accent" : "text-primary/70",
          )}
        >
          {date.getDate()}
        </span>
        {count > 0 ? (
          <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent">
            {count}
          </span>
        ) : null}
      </div>
      {count > 0 ? (
        <div className="mt-auto flex gap-0.5 pt-2">
          {tasks.slice(0, 3).map((task) => (
            <span
              key={task.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                STATUS_DOT[normStatus(task.status)],
              )}
            />
          ))}
        </div>
      ) : (
        <span className="mt-auto" />
      )}
    </button>
  );
}

export function CalendarBoard({
  items,
  filter,
  rangeStart,
  rangeEnd,
  onOpen,
}: {
  items: TimelineTask[];
  filter: TimelineFilter;
  rangeStart: Date;
  rangeEnd: Date;
  onOpen: (task: TimelineTask) => void;
}) {
  const byDay = useMemo(() => groupByDueDay(items), [items]);
  const [hover, setHover] = useState<DayTip | null>(null);
  const [pinned, setPinned] = useState<DayTip | null>(null);

  const handleSelect = useCallback(
    (tip: DayTip) => {
      setHover(null);
      if (tip.tasks.length === 1) {
        setPinned(null);
        onOpen(tip.tasks[0]);
        return;
      }
      if (tip.tasks.length > 1) {
        setPinned(tip);
        return;
      }
      setPinned(null);
    },
    [onOpen],
  );

  const openFromPin = useCallback(
    (task: TimelineTask) => {
      setPinned(null);
      onOpen(task);
    },
    [onOpen],
  );

  const preview = pinned ? null : hover;

  if (filter === "today" || filter === "tomorrow") {
    const day = rangeStart;
    const tasks = byDay.get(dateKey(day)) ?? [];
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/45">
          {formatDayLabel(day)}
        </p>
        {tasks.length === 0 ? (
          <p className="mt-6 text-sm text-primary/45">No tasks due this day.</p>
        ) : (
          <div className="mt-3 max-w-xl space-y-1 rounded-xl border border-glass bg-glass-card/40 p-2">
            {tasks.map((task) => (
              <DayTaskRow key={task.id} task={task} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (filter === "yearly") {
    const year = rangeStart.getFullYear();
    return (
      <div className="relative min-h-0 flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, month) => {
            const cells = monthGrid(year, month);
            const label = new Date(year, month, 1).toLocaleDateString("en-US", {
              month: "long",
            });
            return (
              <div
                key={month}
                className="overflow-hidden rounded-xl border border-glass bg-glass-card/40"
              >
                <p className="border-b border-glass px-3 py-2 text-sm font-semibold text-primary">
                  {label}
                </p>
                <div className="grid grid-cols-7 px-1.5 pt-2 text-center text-[10px] font-medium uppercase text-primary/35">
                  {WEEKDAYS.map((d) => (
                    <span key={d}>{d.slice(0, 2)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 p-1.5">
                  {cells.map((date) => (
                    <CalendarCell
                      key={dateKey(date)}
                      date={date}
                      tasks={
                        date.getMonth() === month
                          ? (byDay.get(dateKey(date)) ?? [])
                          : []
                      }
                      inMonth={date.getMonth() === month}
                      compact
                      selected={
                        pinned
                          ? dateKey(pinned.date) === dateKey(date)
                          : false
                      }
                      onHover={setHover}
                      onLeave={() => setHover(null)}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {preview && preview.tasks.length > 0 ? (
          <DayTooltip tip={preview} onOpen={onOpen} />
        ) : null}
        {pinned ? (
          <DayTooltip
            tip={pinned}
            interactive
            onOpen={openFromPin}
            onClose={() => setPinned(null)}
          />
        ) : null}
      </div>
    );
  }

  const days =
    filter === "monthly"
      ? monthGrid(rangeStart.getFullYear(), rangeStart.getMonth())
      : eachDay(rangeStart, rangeEnd);
  const month = rangeStart.getMonth();
  const cols = 7;

  return (
    <div className="relative min-h-0 flex-1 overflow-auto p-3">
      <div className="overflow-hidden rounded-xl border border-glass">
        <div
          className="grid border-b border-glass bg-glass-card/50"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="border-r border-glass/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-primary/45 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {days.map((date) => (
            <CalendarCell
              key={dateKey(date)}
              date={date}
              tasks={byDay.get(dateKey(date)) ?? []}
              inMonth={filter === "monthly" ? date.getMonth() === month : true}
              selected={pinned ? dateKey(pinned.date) === dateKey(date) : false}
              onHover={setHover}
              onLeave={() => setHover(null)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
      {preview && (preview.tasks.length > 0 || filter === "weekly") ? (
        <DayTooltip tip={preview} onOpen={onOpen} />
      ) : null}
      {pinned ? (
        <DayTooltip
          tip={pinned}
          interactive
          onOpen={openFromPin}
          onClose={() => setPinned(null)}
        />
      ) : null}
    </div>
  );
}
