"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type DropdownPlacement = "top" | "bottom";

export type FloatingMenuStyle = {
  placement: DropdownPlacement;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function getDropdownAnimationClasses(placement: DropdownPlacement): string {
  return placement === "bottom"
    ? "animate-in fade-in slide-in-from-top-2"
    : "animate-in fade-in slide-in-from-bottom-2";
}

export function computeFloatingMenuStyle(
  trigger: HTMLElement,
  menu: HTMLElement | null,
  estimatedHeight: number,
  gap = 8,
  viewportPadding = 12,
  minWidth = 0,
): FloatingMenuStyle {
  const rect = trigger.getBoundingClientRect();
  const menuHeight = menu?.offsetHeight || estimatedHeight;
  const width = Math.max(rect.width, minWidth);

  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;

  const placement: DropdownPlacement =
    spaceBelow >= menuHeight + gap
      ? "bottom"
      : spaceAbove > spaceBelow
        ? "top"
        : "bottom";

  const available = placement === "bottom" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(120, available - gap);
  const renderedHeight = Math.min(menuHeight, maxHeight);

  const top =
    placement === "bottom"
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - gap - renderedHeight);

  let left = rect.left;
  if (left + width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - viewportPadding - width;
  }
  left = Math.max(viewportPadding, left);

  return { placement, top, left, width, maxHeight };
}

export function useFloatingMenu(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  estimatedHeight: number,
  options: { gap?: number; minWidth?: number } = {},
): {
  menuRef: RefObject<HTMLDivElement | null>;
  style: FloatingMenuStyle | null;
  placement: DropdownPlacement;
  precomputeStyle: () => void;
} {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<FloatingMenuStyle | null>(null);
  const gap = options.gap ?? 8;
  const minWidth = options.minWidth ?? 0;

  const updateStyle = () => {
    if (!triggerRef.current) return;
    setStyle(
      computeFloatingMenuStyle(
        triggerRef.current,
        menuRef.current,
        estimatedHeight,
        gap,
        12,
        minWidth,
      ),
    );
  };

  const precomputeStyle = () => {
    if (!triggerRef.current) return;
    setStyle(
      computeFloatingMenuStyle(
        triggerRef.current,
        null,
        estimatedHeight,
        gap,
        12,
        minWidth,
      ),
    );
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return;
    }

    updateStyle();
    const frame = requestAnimationFrame(updateStyle);

    window.addEventListener("resize", updateStyle);
    window.addEventListener("scroll", updateStyle, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateStyle);
      window.removeEventListener("scroll", updateStyle, true);
    };
  }, [isOpen, estimatedHeight, gap, minWidth, triggerRef]);

  return {
    menuRef,
    style,
    placement: style?.placement ?? "bottom",
    precomputeStyle,
  };
}

type FloatingMenuPortalProps = {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  style: FloatingMenuStyle | null;
  className: string;
  children: React.ReactNode;
  menuMaxHeight?: number;
  role?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

export function FloatingMenuPortal({
  isOpen,
  triggerRef,
  menuRef,
  style,
  className,
  children,
  menuMaxHeight,
  role,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
}: FloatingMenuPortalProps) {
  if (!isOpen || !style || typeof document === "undefined") return null;

  const maxHeight = menuMaxHeight
    ? Math.min(menuMaxHeight, style.maxHeight)
    : style.maxHeight;

  return createPortal(
    <div
      ref={menuRef}
      role={role}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        width: style.width,
        maxHeight,
        zIndex: 200,
      }}
      className={cn(className, getDropdownAnimationClasses(style.placement))}
    >
      {children}
    </div>,
    document.body,
  );
}

export function useFloatingClickOutside(
  isOpen: boolean,
  onClose: () => void,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onClose, triggerRef, menuRef]);
}
