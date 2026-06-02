"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DROPDOWN_MENU_MAX_HEIGHT,
  multiSelectMenuVariants,
  multiSelectTriggerVariants,
  type MultiSelectVariant,
  type SelectOption,
} from "@/components/ui/fieldVariants";
import {
  FloatingMenuPortal,
  useFloatingClickOutside,
  useFloatingMenu,
} from "@/components/ui/useDropdownPlacement";

type MultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  variant?: MultiSelectVariant;
  className?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

const chipVariants: Record<
  MultiSelectVariant,
  { chip: string; remove: string; item: string; itemSelected: string }
> = {
  glass: {
    chip: "flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent backdrop-blur-sm",
    remove: "text-accent/60 transition-colors hover:text-accent",
    item: "hover:bg-accent/10",
    itemSelected: "bg-accent/25",
  },
  pill: {
    chip: "flex items-center gap-1.5 rounded-full border border-glass bg-glass-card px-3 py-1 text-xs font-medium text-primary",
    remove: "text-primary/50 transition-colors hover:text-accent",
    item: "hover:bg-glass-button",
    itemSelected: "bg-glass-button",
  },
  outline: {
    chip: "flex items-center gap-1.5 rounded-lg border border-accent/40 bg-transparent px-2.5 py-1 text-xs font-medium text-accent",
    remove: "text-accent/60 transition-colors hover:text-accent",
    item: "border border-transparent hover:border-accent/20",
    itemSelected: "border border-accent/30 bg-accent/10",
  },
};

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  variant = "glass",
  className,
  id,
  "aria-label": ariaLabel,
  disabled = false,
}: MultiSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const styles = chipVariants[variant];

  const { menuRef, style, precomputeStyle } = useFloatingMenu(
    rootRef,
    isOpen,
    DROPDOWN_MENU_MAX_HEIGHT,
  );

  const close = useCallback(() => setIsOpen(false), []);
  useFloatingClickOutside(isOpen, close, rootRef, menuRef);

  const toggleOption = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  const removeOption = (event: React.MouseEvent, optionValue: string) => {
    event.stopPropagation();
    onChange(value.filter((item) => item !== optionValue));
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) precomputeStyle();
    setIsOpen((open) => !open);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        id={selectId}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleOpen();
          }
        }}
        className={cn(
          multiSelectTriggerVariants[variant],
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {value.length === 0 ? (
            <span className="text-primary/40">{placeholder}</span>
          ) : (
            value.map((optionValue) => {
              const option = options.find((item) => item.value === optionValue);
              return (
                <span key={optionValue} className={styles.chip}>
                  {option?.label ?? optionValue}
                  <button
                    type="button"
                    onClick={(event) => removeOption(event, optionValue)}
                    className={styles.remove}
                    aria-label={`Remove ${option?.label ?? optionValue}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary/40 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </div>

      <FloatingMenuPortal
        isOpen={isOpen}
        triggerRef={rootRef}
        menuRef={menuRef}
        style={style}
        menuMaxHeight={DROPDOWN_MENU_MAX_HEIGHT}
        role="listbox"
        aria-labelledby={selectId}
        className={multiSelectMenuVariants[variant]}
      >
        {options.map((option) => {
          const isSelected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => toggleOption(option.value)}
              className={cn(
                "mt-0.5 flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                isSelected ? styles.itemSelected : styles.item,
              )}
            >
              <div className="min-w-0">
                <p className="font-medium text-primary">{option.label}</p>
                {option.description ? (
                  <p className="text-xs text-primary/50">{option.description}</p>
                ) : null}
              </div>
              {isSelected ? <Check className="size-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </FloatingMenuPortal>
    </div>
  );
}
