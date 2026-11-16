"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type {
  TimelineFilter,
  TimelineSubscription,
  TimelineTask,
} from "@/lib/api/timeline";
import { formatMoney } from "@/lib/subscriptions";
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
  parseDay,
  tipStyle,
} from "@/lib/timeline/layout";

export type DayTip = {
  date: Date;
  tasks: TimelineTask[];
  charges: TimelineSubscription[];
  rect: DOMRect;
};

function chargeLabel(charge: TimelineSubscription) {
  const when = charge.kind === "trial" ? "Trial ends" : "Renews";
  const money = formatMoney(charge.amount, charge.currency);
  return `${when} · ${money}`;
}

function groupCharges(charges: TimelineSubscription[]) {
  const map = new Map<string, TimelineSubscription[]>();
  for (const charge of charges) {
    const day = parseDay(charge.occursAt);
    if (!day) continue;
    const key = dateKey(day);
    const list = map.get(key);
    if (list) list.push(charge);
    else map.set(key, [charge]);
  }
  return map;
}

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
  onOpenCharge,
  onClose,
}: {
  tip: DayTip;
  interactive?: boolean;
  onOpen: (task: TimelineTask) => void;
  onOpenCharge?: (charge: TimelineSubscription) => void;
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
      {tip.tasks.length === 0 && tip.charges.length === 0 ? (
        <p className="mt-1 px-2 text-[11px] text-primary/35">Nothing due</p>
      ) : interactive ? (
        <div className="mt-1">
          {tip.charges.map((charge) => (
            <button
              key={charge.occurrenceKey ?? charge.id}
              type="button"
              onClick={() => onOpenCharge?.(charge)}
              className="block w-full rounded-lg px-2 py-2 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold leading-snug text-sky-300">
                <span className="size-1.5 rotate-45 bg-sky-400" />
                {charge.service}
              </p>
              <p className="mt-0.5 pl-3 text-[10px] text-sky-200/70">
                Subscription · {chargeLabel(charge)}
                {charge.overdue ? " · Overdue" : ""}
              </p>
            </button>
          ))}
          {tip.tasks.map((task) => (
            <DayTaskRow key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2 px-2">
          {tip.charges.map((charge) => (
            <div key={charge.occurrenceKey ?? charge.id}>
              <p className="flex items-center gap-1.5 text-xs font-semibold leading-snug text-sky-300">
                <span className="size-1.5 rotate-45 bg-sky-400" />
                {charge.service}
              </p>
              <p className="mt-0.5 pl-3 text-[10px] text-sky-200/70">
                Subscription · {chargeLabel(charge)}
              </p>
            </div>
          ))}
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
  charges = [],
  inMonth = true,
  compact,
  selected,
  onHover,
  onLeave,
  onSelect,
}: {
  date: Date;
  tasks: TimelineTask[];
  charges?: TimelineSubscription[];
  inMonth?: boolean;
  compact?: boolean;
  selected?: boolean;
  onHover: (tip: DayTip) => void;
  onLeave: () => void;
  onSelect: (tip: DayTip) => void;
}) {
  const isToday = dayOffset(date, sod(new Date())) === 0;
  const count = tasks.length + charges.length;

  const emit = (event: React.MouseEvent, fn: (tip: DayTip) => void) => {
    if (!inMonth) return;
    fn({
      date,
      tasks,
      charges,
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
      aria-label={`${formatDayLabel(date)}${tasks.length ? `, ${tasks.length} tasks` : ""}${charges.length ? `, ${charges.length} subscriptions` : ""}`}
      className={cn(
        "flex flex-col border-r border-b border-glass/70 p-1.5 text-left transition",
        "h-full min-h-0",
        compact ? "min-h-12" : "min-h-16",
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
        <span className="flex items-center gap-1">
          {tasks.length > 0 ? (
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-primary/70">
              {tasks.length}
            </span>
          ) : null}
          {charges.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-300 light:text-sky-700">
              <span className="size-1.5 rotate-45 bg-sky-400 light:bg-sky-600" />
              {charges.length}
            </span>
          ) : null}
        </span>
      </div>
      {count > 0 ? (
        <div className="mt-auto space-y-1 pt-2">
          {charges[0] ? (
            <p className="flex items-center gap-1 truncate text-[10px] font-semibold text-sky-300 light:text-sky-700">
              <span className="size-1.5 shrink-0 rotate-45 bg-sky-400 light:bg-sky-600" />
              {charges[0].service}
              {charges.length > 1 ? ` +${charges.length - 1}` : ""}
            </p>
          ) : null}
          {tasks.length > 0 ? (
            <div className="flex gap-0.5">
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
          ) : null}
        </div>
      ) : (
        <span className="mt-auto" />
      )}
    </button>
  );
}

export function CalendarBoard({
  items,
  charges = [],
  filter,
  rangeStart,
  rangeEnd,
  onOpen,
  onOpenCharge,
}: {
  items: TimelineTask[];
  charges?: TimelineSubscription[];
  filter: TimelineFilter;
  rangeStart: Date;
  rangeEnd: Date;
  onOpen: (task: TimelineTask) => void;
  onOpenCharge?: (charge: TimelineSubscription) => void;
}) {
  const byDay = useMemo(() => groupByDueDay(items), [items]);
  const chargesByDay = useMemo(() => groupCharges(charges), [charges]);
  const [hover, setHover] = useState<DayTip | null>(null);
  const [pinned, setPinned] = useState<DayTip | null>(null);

  const handleSelect = useCallback(
    (tip: DayTip) => {
      setHover(null);
      const total = tip.tasks.length + tip.charges.length;
      if (total === 1 && tip.tasks.length === 1) {
        setPinned(null);
        onOpen(tip.tasks[0]);
        return;
      }
      if (total === 1 && tip.charges[0]) {
        setPinned(null);
        onOpenCharge?.(tip.charges[0]);
        return;
      }
      if (total > 1) {
        setPinned(tip);
        return;
      }
      setPinned(null);
    },
    [onOpen, onOpenCharge],
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
    const dayCharges = chargesByDay.get(dateKey(day)) ?? [];
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/45">
          {formatDayLabel(day)}
        </p>
        {tasks.length === 0 && dayCharges.length === 0 ? (
          <p className="mt-6 text-sm text-primary/45">Nothing due this day.</p>
        ) : (
          <div className="mt-3 max-w-xl space-y-1 rounded-xl border border-glass bg-glass-card/40 p-2">
            {dayCharges.map((charge) => (
              <button
                key={charge.occurrenceKey ?? charge.id}
                type="button"
                onClick={() => onOpenCharge?.(charge)}
                className="block w-full rounded-lg px-2 py-2 text-left outline-none transition hover:bg-white/5"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                  <span className="size-1.5 rotate-45 bg-sky-400" />
                  {charge.service}
                </p>
                <p className="mt-0.5 pl-3 text-[10px] text-sky-200/70">
                  Subscription · {chargeLabel(charge)}
                </p>
              </button>
            ))}
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
                      charges={
                        date.getMonth() === month
                          ? (chargesByDay.get(dateKey(date)) ?? [])
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
        {preview && (preview.tasks.length > 0 || preview.charges.length > 0) ? (
          <DayTooltip tip={preview} onOpen={onOpen} onOpenCharge={onOpenCharge} />
        ) : null}
        {pinned ? (
          <DayTooltip
            tip={pinned}
            interactive
            onOpen={openFromPin}
            onOpenCharge={(charge) => {
              setPinned(null);
              onOpenCharge?.(charge);
            }}
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-glass">
        <div
          className="grid shrink-0 border-b border-glass bg-glass-card/50"
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
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${Math.max(1, days.length / cols)}, minmax(0, 1fr))`,
          }}
        >
          {days.map((date) => (
            <CalendarCell
              key={dateKey(date)}
              date={date}
              tasks={byDay.get(dateKey(date)) ?? []}
              charges={chargesByDay.get(dateKey(date)) ?? []}
              inMonth={filter === "monthly" ? date.getMonth() === month : true}
              selected={pinned ? dateKey(pinned.date) === dateKey(date) : false}
              onHover={setHover}
              onLeave={() => setHover(null)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
      {preview &&
      (preview.tasks.length > 0 || preview.charges.length > 0 || filter === "weekly") ? (
        <DayTooltip tip={preview} onOpen={onOpen} onOpenCharge={onOpenCharge} />
      ) : null}
      {pinned ? (
        <DayTooltip
          tip={pinned}
          interactive
          onOpen={openFromPin}
          onOpenCharge={(charge) => {
            setPinned(null);
            onOpenCharge?.(charge);
          }}
          onClose={() => setPinned(null)}
        />
      ) : null}
    </div>
  );
}
