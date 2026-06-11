"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

type SideDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
};

export function SideDrawer({
  isOpen,
  onClose,
  title,
  children,
  panelClassName,
  bodyClassName,
}: SideDrawerProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close drawer"
        className="fixed inset-0 z-150 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-drawer-title"
        className={cn(
          "fixed inset-y-0 right-0 z-160 flex w-full max-w-md flex-col border-l border-glass bg-sidebar/95 shadow-2xl shadow-black/30 backdrop-blur-3xl animate-in slide-in-from-right duration-300 ease-out",
          panelClassName,
        )}
      >
        <div className="flex items-center justify-between border-b border-glass px-6 py-4">
          <h2
            id="side-drawer-title"
            className="pr-4 text-lg font-semibold tracking-tight text-primary"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-glass bg-glass-button p-2 text-primary/70 transition hover:text-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className={cn("flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>
          {children}
        </div>
      </aside>
    </>,
    document.body,
  );
}
