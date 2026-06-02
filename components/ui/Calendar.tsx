"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputVariants } from "@/components/ui/fieldVariants";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthGrid(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function formatDueDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type CalendarProps = {
  viewDate: Date;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  onViewChange: (date: Date) => void;
  className?: string;
};

export function Calendar({
  viewDate,
  selectedDate,
  onSelect,
  onViewChange,
  className,
}: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const cells = useMemo(() => getMonthGrid(viewDate), [viewDate]);

  const monthLabel = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn("p-3", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() =>
            onViewChange(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
          }
          className="rounded-lg border border-glass bg-glass-button p-1.5 text-primary/70 transition hover:text-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold text-primary">{monthLabel}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() =>
            onViewChange(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
          }
          className="rounded-lg border border-glass bg-glass-button p-1.5 text-primary/70 transition hover:text-accent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-primary/45"
          >
            {day}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} aria-hidden />;
          }

          const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-sm transition",
                isSelected
                  ? "bg-accent font-semibold text-white"
                  : "text-primary hover:bg-accent/15",
                isToday && !isSelected && "ring-1 ring-accent/50",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DatePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "Select due date...",
  className,
  id,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const generatedId = useId();
  const pickerId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ?? new Date());

  const { menuRef, style, precomputeStyle } = useFloatingMenu(rootRef, isOpen, 320, {
    minWidth: 272,
  });

  const close = useCallback(() => setIsOpen(false), []);
  useFloatingClickOutside(isOpen, close, rootRef, menuRef);

  useEffect(() => {
    if (value) setViewDate(value);
  }, [value]);

  const toggleOpen = () => {
    if (!isOpen) precomputeStyle();
    setIsOpen((open) => !open);
  };

  const displayValue = value ? formatDueDate(value) : placeholder;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={pickerId}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={toggleOpen}
        className={cn(
          inputVariants.glass,
          "flex cursor-pointer items-center justify-between gap-2 text-left",
        )}
      >
        <span className={cn("truncate", !value && "text-primary/40")}>
          {displayValue}
        </span>
        <CalendarDays className="size-4 shrink-0 text-primary/40" />
      </button>

      <FloatingMenuPortal
        isOpen={isOpen}
        triggerRef={rootRef}
        menuRef={menuRef}
        style={style}
        role="dialog"
        aria-label="Choose due date"
        className="rounded-xl border border-glass bg-sidebar shadow-xl shadow-black/50 backdrop-blur-2xl"
      >
        <Calendar
          viewDate={viewDate}
          selectedDate={value}
          onViewChange={setViewDate}
          onSelect={(date) => {
            onChange(date);
            setIsOpen(false);
          }}
        />
      </FloatingMenuPortal>
    </div>
  );
}
