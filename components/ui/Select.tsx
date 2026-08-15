"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DROPDOWN_MENU_MAX_HEIGHT,
  selectMenuVariants,
  selectTriggerVariants,
  type SelectOption,
  type SelectVariant,
} from "@/components/ui/fieldVariants";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";

const MENU_ESTIMATES: Record<SelectVariant, number> = {
  glass: DROPDOWN_MENU_MAX_HEIGHT,
  compact: DROPDOWN_MENU_MAX_HEIGHT,
  minimal: DROPDOWN_MENU_MAX_HEIGHT,
};

const MENU_GAPS: Record<SelectVariant, number> = {
  glass: 8,
  compact: 6,
  minimal: 4,
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  variant?: SelectVariant;
  className?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  variant = "glass",
  className,
  id,
  "aria-label": ariaLabel,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuEstimate = searchable ? 320 : MENU_ESTIMATES[variant];

  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    rootRef,
    isOpen,
    menuEstimate,
    { gap: MENU_GAPS[variant] },
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);
  useFloatingClickOutside(isOpen, close, rootRef, menuRef);

  useEffect(() => {
    if (!isOpen || !searchable) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen, searchable]);

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

  const toggleOpen = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    if (isOpen) {
      close();
      return;
    }
    precomputeStyle();
    setIsOpen(true);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={selectId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={toggleOpen}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          selectTriggerVariants[variant],
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className={cn("truncate", !selected && "text-primary/40")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary/40 transition-transform duration-200",
            isOpen && "rotate-180",
            variant === "compact" && "size-3.5",
          )}
        />
      </button>

      <FloatingMenuPortal
        isOpen={isOpen}
        triggerRef={rootRef}
        menuRef={menuRef}
        style={style}
        menuMaxHeight={searchable ? 320 : DROPDOWN_MENU_MAX_HEIGHT}
        role="listbox"
        aria-labelledby={selectId}
        className={cn(selectMenuVariants[variant], searchable && "max-h-80")}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {searchable ? (
            <div className="sticky top-0 z-10 mb-1 bg-sidebar p-1">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-lg border border-glass bg-glass-button px-3 py-2 text-sm text-primary outline-none placeholder:text-primary/40 focus:border-accent/50"
              />
            </div>
          ) : null}
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-3 text-sm text-primary/50">No matches</p>
          ) : (
            visibleOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left transition-colors mb-1",
                    variant === "compact" ? "py-1.5 text-xs" : "text-sm",
                    isSelected ? "bg-accent/25" : "hover:bg-accent/10",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary">{option.label}</p>
                    {option.description ? (
                      <p className="truncate text-xs text-primary/50">{option.description}</p>
                    ) : null}
                  </div>
                  {isSelected ? <Check className="size-4 shrink-0 text-accent" /> : null}
                </button>
              );
            })
          )}
        </div>
      </FloatingMenuPortal>
    </div>
  );
}
