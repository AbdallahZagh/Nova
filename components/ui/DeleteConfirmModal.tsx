"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

type DeleteConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  itemName?: string;
  confirmLabel?: string;
};

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete item",
  message,
  itemName,
  confirmLabel = "Delete",
}: DeleteConfirmModalProps) {
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

  const bodyMessage =
    message ??
    (itemName
      ? `"${itemName}" will be permanently removed. This action cannot be undone.`
      : "This item will be permanently removed. This action cannot be undone.");

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      aria-describedby="delete-confirm-message"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200 sm:zoom-in-95 sm:slide-in-from-bottom-0">
        {/* Top accent bar */}
        <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-linear-90 from-transparent via-red-400/60 to-transparent" />

        <div className="rounded-2xl border border-glass bg-sidebar shadow-2xl shadow-black/50 backdrop-blur-2xl">
          {/* Icon header */}
          <div className="flex flex-col items-center px-6 pt-8 pb-5 text-center">
            <div className="relative mb-5">
              <div className="size-16 rounded-2xl border border-red-500/20 bg-red-500/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Trash2 className="size-7 text-red-400" />
              </div>
            </div>

            <h2
              id="delete-confirm-title"
              className="text-xl font-semibold tracking-tight text-primary"
            >
              {title}
            </h2>

            <p
              id="delete-confirm-message"
              className="mt-2.5 text-sm leading-relaxed text-primary/65"
            >
              {bodyMessage}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-glass-border" />

          {/* Actions */}
          <div className="flex gap-3 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-glass-button/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
