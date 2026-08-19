"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";

function subscribe() {
  return () => {};
}

type WhiteboardSettingsModalProps = {
  isOpen: boolean;
  autoSave: boolean;
  saving?: boolean;
  onClose: () => void;
  onToggleAutoSave: () => void;
};

export function WhiteboardSettingsModal({
  isOpen,
  autoSave,
  saving,
  onClose,
  onToggleAutoSave,
}: WhiteboardSettingsModalProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose, saving]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close board settings"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-glass bg-sidebar p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Settings className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">Board settings</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-primary/60">
              Controls how this board behaves when you leave.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={autoSave}
          disabled={saving}
          onClick={onToggleAutoSave}
          className="mt-5 flex w-full items-center justify-between gap-4 rounded-xl border border-glass bg-glass-button/40 px-3 py-3 text-left disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-semibold text-primary">
              Auto-save cover snapshot on exit
            </span>
            <span className="mt-0.5 block text-xs text-primary/50">
              Skip the exit prompt and save a new cover image in the background.
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              autoSave ? "bg-accent" : "bg-primary/20"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition ${
                autoSave ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
