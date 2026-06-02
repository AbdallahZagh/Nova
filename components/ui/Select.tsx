"use client";

import { useCallback, useId, useRef, useState } from "react";
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
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    rootRef,
    isOpen,
    MENU_ESTIMATES[variant],
    { gap: MENU_GAPS[variant] },
  );

  const close = useCallback(() => setIsOpen(false), []);
  useFloatingClickOutside(isOpen, close, rootRef, menuRef);

  const selected = options.find((option) => option.value === value);

  const toggleOpen = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    if (!isOpen) precomputeStyle();
    setIsOpen((open) => !open);
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
        menuMaxHeight={DROPDOWN_MENU_MAX_HEIGHT}
        role="listbox"
        aria-labelledby={selectId}
        className={selectMenuVariants[variant]}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
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
          })}
        </div>
      </FloatingMenuPortal>
    </div>
  );
}
