"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WhiteboardPage } from "@/lib/whiteboard/types";

export type WhiteboardExportFormat = "pdf" | "png" | "zip";
export type WhiteboardExportScope = "current" | "all" | "selected";

const FORMATS: { value: WhiteboardExportFormat; label: string; hint: string }[] =
  [
    { value: "pdf", label: "PDF", hint: "One document" },
    { value: "png", label: "PNG", hint: "Image, or ZIP if several pages" },
    { value: "zip", label: "ZIP", hint: "PNG for each page" },
  ];

type WhiteboardExportModalProps = {
  isOpen: boolean;
  pages: WhiteboardPage[];
  currentPageId?: string | null;
  downloading?: boolean;
  savingPng?: boolean;
  canSaveImage?: boolean;
  onClose: () => void;
  onDownload: (format: WhiteboardExportFormat, pageIds: string[]) => void;
  onSavePng?: (pageIds: string[]) => void;
};

function subscribe() {
  return () => {};
}

export function WhiteboardExportModal({
  isOpen,
  pages,
  currentPageId,
  downloading,
  savingPng,
  canSaveImage,
  onClose,
  onDownload,
  onSavePng,
}: WhiteboardExportModalProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [format, setFormat] = useState<WhiteboardExportFormat>("pdf");
  const [scope, setScope] = useState<WhiteboardExportScope>(
    pages.length > 1 ? "all" : "current",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [],
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormat("pdf");
    setScope(pages.length > 1 ? "all" : "current");
    setSelectedIds(
      currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [],
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !downloading && !savingPng) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // Reset form when the modal opens, not when pages update after saving a PNG.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pageIds = useMemo(() => {
    if (scope === "current") {
      return currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [];
    }
    if (scope === "all") return pages.map((page) => page.id);
    return selectedIds;
  }, [currentPageId, pages, scope, selectedIds]);

  const readyPages = pages.filter((page) => page.snapshot);
  const selectedReady = pageIds.filter((id) =>
    readyPages.some((page) => page.id === id),
  );
  const missingIds = pageIds.filter(
    (id) => !pages.some((page) => page.id === id && page.snapshot),
  );
  const canDownload = selectedReady.length > 0 && !downloading && !savingPng;
  const busy = downloading || savingPng;

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close download options"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        disabled={busy}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-glass bg-sidebar p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Download className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">Download board</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-primary/60">
              Choose a file type and which pages to include.
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-primary/50">
          File type
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FORMATS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFormat(item.value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                format === item.value
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-glass bg-glass-button text-primary/70 hover:text-primary",
              )}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug opacity-70">
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-primary/50">
          Pages
        </p>
        <div className="mt-2 space-y-2">
          {(
            [
              ["current", "Current page"],
              ["all", "All pages"],
              ["selected", "Select pages"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
                scope === value
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-glass bg-glass-button text-primary/70 hover:text-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  scope === value
                    ? "border-accent bg-accent"
                    : "border-primary/30",
                )}
              >
                {scope === value ? (
                  <span className="size-1.5 rounded-full bg-white" />
                ) : null}
              </span>
              {label}
            </button>
          ))}
        </div>

        {scope === "selected" ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {pages.map((page, index) => {
              const checked = selectedIds.includes(page.id);
              const saved = Boolean(page.snapshot);
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    disabled={!saved && !canSaveImage}
                    onClick={() =>
                      setSelectedIds((current) =>
                        checked
                          ? current.filter((id) => id !== page.id)
                          : [...current, page.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm",
                      saved || canSaveImage
                        ? "text-primary hover:bg-glass-button"
                        : "cursor-not-allowed text-primary/35",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded border",
                        checked
                          ? "border-accent bg-accent text-white"
                          : "border-primary/30",
                      )}
                    >
                      {checked ? <span className="text-[10px]">✓</span> : null}
                    </span>
                    Page {index + 1}
                    {!saved ? (
                      <span className="ml-auto text-[11px]">No image yet</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {missingIds.length > 0 ? (
          <p className="mt-3 text-xs text-primary/55">
            {canSaveImage
              ? "Some selected pages have no saved image yet. Save them as PNG first, then download."
              : "Some selected pages have no saved image yet. Ask an admin to save them as PNG first."}
          </p>
        ) : format === "png" && selectedReady.length > 1 ? (
          <p className="mt-3 text-xs text-primary/50">
            Several PNG pages download together as a ZIP.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          {missingIds.length > 0 && canSaveImage && onSavePng ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSavePng(missingIds)}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingPng ? "Saving PNG…" : "Save as PNG"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canDownload}
              onClick={() => onDownload(format, pageIds)}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
