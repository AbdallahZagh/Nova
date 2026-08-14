"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ImageIcon } from "lucide-react";

function subscribe() {
  return () => {};
}

type SaveSnapshotModalProps = {
  isOpen: boolean;
  saving: boolean;
  canSave?: boolean;
  onSave: () => void;
  onSkip: () => void;
  onStay: () => void;
};

export function SaveSnapshotModal({
  isOpen,
  saving,
  canSave = true,
  onSave,
  onSkip,
  onStay,
}: SaveSnapshotModalProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onStay();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onStay, saving]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Stay on board"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        disabled={saving}
        onClick={onStay}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-glass bg-sidebar p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ImageIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">
              {canSave ? "Save board as an image?" : "Leave this board?"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-primary/60">
              {canSave
                ? "Upload a PNG for each page. If a page already has an image, the old one is replaced."
                : "Your strokes stay on the board. Only admins can save pages as images."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          {canSave ? (
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save image"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={onSkip}
            className="rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
          >
            Don’t save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onStay}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-primary/60 hover:text-primary"
          >
            Stay
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
