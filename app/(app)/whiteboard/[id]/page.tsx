"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, MoreHorizontal, PanelRight } from "lucide-react";
import { WhiteboardEditorSkeleton } from "@/components/skeletons/WhiteboardEditorSkeleton";
import { SaveSnapshotModal } from "@/components/whiteboard/SaveSnapshotModal";
import { WhiteboardCanvas } from "@/components/whiteboard/WhiteboardCanvas";
import { WhiteboardDetailsDrawer } from "@/components/whiteboard/WhiteboardDetailsDrawer";
import { WhiteboardExportModal } from "@/components/whiteboard/WhiteboardExportModal";
import { WhiteboardMembersModal } from "@/components/whiteboard/WhiteboardMembersModal";
import { WhiteboardPagesBar } from "@/components/whiteboard/WhiteboardPagesBar";
import { WhiteboardPresenceBar } from "@/components/whiteboard/WhiteboardPresenceBar";
import { WhiteboardToolbar } from "@/components/whiteboard/WhiteboardToolbar";
import { WhiteboardToolsDock } from "@/components/whiteboard/WhiteboardToolsDock";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/components/providers/UserProvider";
import { downloadWhiteboardExportApi } from "@/lib/api/whiteboards";
import { ApiError } from "@/lib/api/client";
import { useBoardTheme } from "@/lib/whiteboard/useBoardTheme";
import { useWhiteboardSync } from "@/lib/whiteboard/useWhiteboardSync";
import { useLeaveBoardGuard } from "@/lib/whiteboard/useLeaveBoardGuard";
import { cn } from "@/lib/cn";
import { BOARD_VIEW_ASPECT } from "@/lib/whiteboard/types";

export default function WhiteboardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const sync = useWhiteboardSync(id);
  const theme = useBoardTheme();
  const { toast } = useToast();
  const { profile } = useUser();
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingPng, setSavingPng] = useState(false);

  const lastInkRef = useRef(theme.ink);
  const inkReadyRef = useRef(false);

  useEffect(() => {
    setTitle(sync.board?.title ?? "");
  }, [sync.board?.title]);

  useEffect(() => {
    if (!inkReadyRef.current) {
      sync.setColor(theme.ink);
      inkReadyRef.current = true;
      lastInkRef.current = theme.ink;
      return;
    }
    if (sync.color === lastInkRef.current) {
      sync.setColor(theme.ink);
    }
    lastInkRef.current = theme.ink;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.ink]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!sync.canDraw) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) sync.redo();
        else sync.undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        sync.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sync.canDraw, sync.redo, sync.undo]);

  const listHref = sync.board?.projectId
    ? `/whiteboard?projectId=${sync.board.projectId}`
    : "/whiteboard";

  const leaveToList = (href?: string) => {
    router.push(href || listHref);
  };

  const skipLeaveRef = useRef<() => void>(() => {});

  const guard = useLeaveBoardGuard({
    active: Boolean(sync.board),
    fallbackHref: listHref,
    onLeaveAttempt: () => {
      if (sync.canSaveImage) {
        setLeaveOpen(true);
        return;
      }
      skipLeaveRef.current();
    },
  });

  const handleSaveAndLeave = async () => {
    setLeaving(true);
    try {
      await sync.saveAllSnapshots(theme.paper, theme.dark);
      guard.allowLeave();
      leaveToList(guard.consumeDestination(listHref));
    } catch {
      setLeaving(false);
      toast({
        variant: "error",
        title: "Could not save image",
        message: "Your strokes are still on the board. Try again.",
      });
    }
  };

  const handleSkipAndLeave = async () => {
    setLeaving(true);
    try {
      await sync.flushOps();
      guard.allowLeave();
      leaveToList(guard.consumeDestination(listHref));
    } catch {
      setLeaving(false);
    }
  };
  skipLeaveRef.current = () => {
    void handleSkipAndLeave();
  };

  const requestLeave = (href?: string) => {
    if (href) guard.setDestination(href);
    if (sync.canSaveImage) {
      setLeaveOpen(true);
      return;
    }
    void handleSkipAndLeave();
  };

  if (sync.loading) {
    return <WhiteboardEditorSkeleton />;
  }

  if (sync.error || !sync.board) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-20 text-center">
        <h1 className="text-2xl font-semibold">Whiteboard not found</h1>
        <p className="text-sm text-primary/60">
          {sync.error || "This board may have been deleted."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/whiteboard")}
          className="text-sm font-medium text-accent hover:underline"
        >
          Back to whiteboards
        </button>
      </div>
    );
  }

  const handleExport = async (
    format: "pdf" | "zip" | "png",
    pageIds: string[],
  ) => {
    setExporting(true);
    try {
      const file = await downloadWhiteboardExportApi(
        sync.board!.id,
        format,
        pageIds,
      );
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(href);
      setExportOpen(false);
    } catch (err) {
      toast({
        variant: "error",
        title: "Export failed",
        message: err instanceof ApiError ? err.message : "Save snapshots first, then export.",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleSavePng = async (pageIds: string[]) => {
    setSavingPng(true);
    try {
      await sync.saveSnapshotsForPages(pageIds, theme.paper, theme.dark);
      toast({
        variant: "success",
        title: "Saved as PNG",
        message: "You can download those pages now.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not save PNG",
        message: err instanceof ApiError ? err.message : "Try again.",
      });
    } finally {
      setSavingPng(false);
    }
  };

  const saveLabel =
    sync.saveState === "saving"
      ? "Saving…"
      : sync.saveState === "error"
        ? "Save failed"
        : sync.saveState === "saved"
          ? "Saved"
          : "Live";

  return (
    <div className="relative -m-6 flex h-[calc(100dvh-4rem)] flex-col md:-m-8">
      <div className="z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-glass bg-main px-4 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.18)] md:px-6">
        <button
          type="button"
          onClick={() => requestLeave(listHref)}
          className="rounded-xl p-2 text-primary/70 hover:bg-glass-button hover:text-accent"
        >
          <ArrowLeft className="size-4" />
        </button>
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              const next = title.trim();
              if (next !== (sync.board?.title ?? "")) {
                void sync.rename(next || "Untitled board");
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="rounded-lg border border-glass bg-glass-button px-2 py-1 text-lg font-semibold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => sync.canDraw && setEditingTitle(true)}
            className="text-lg font-semibold text-primary hover:text-accent"
          >
            {sync.board.title || "Untitled board"}
          </button>
        )}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            sync.saveState === "error"
              ? "bg-danger/15 text-danger"
              : "bg-glass-button text-primary/55",
          )}
        >
          {saveLabel}
        </span>
        {sync.myRole === "VIEWER" ? (
          <span className="rounded-full bg-glass-button px-2.5 py-1 text-xs font-medium text-primary/55">
            Viewer · comments only
          </span>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <WhiteboardPresenceBar people={sync.people} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-xl border border-glass bg-glass-button p-2.5 text-primary/70 hover:text-accent"
              aria-label="Board actions"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-glass bg-sidebar py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDetailsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glass-button"
                >
                  <PanelRight className="size-4" /> Board details
                </button>
                {sync.canExport ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setExportOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glass-button"
                  >
                    <Download className="size-4" /> Download
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMembersOpen(true)}
            className="rounded-xl border border-glass bg-glass-button px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-accent/40 hover:text-accent"
          >
            Collaborators
          </button>
        </div>
      </div>

      <WhiteboardPagesBar
        pages={sync.pages}
        pageId={sync.pageId}
        canAdd={sync.canDraw && !profile?.isDemo}
        canDelete={sync.canManage && !profile?.isDemo}
        onSelect={(next) => void sync.switchPage(next)}
        onAdd={() => void sync.addPage()}
        onDelete={(target) => void sync.removePage(target)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6 mt-2">
        <div
          className="relative w-full"
          style={{ aspectRatio: BOARD_VIEW_ASPECT }}
        >
          <div className="absolute inset-0">
            <WhiteboardCanvas
              document={sync.document}
              remoteDrafts={sync.remoteDrafts}
              presence={sync.presence}
              tool={sync.tool}
              color={sync.color}
              width={sync.width}
              paper={theme.paper}
              surround={theme.surround}
              dark={theme.dark}
              onStrokeComplete={sync.addStroke}
              onDraftChange={sync.broadcastDraft}
              onCursorMove={sync.broadcastCursor}
              onInteract={() => setToolsOpen(false)}
              readOnly={!sync.canDraw}
            />
          </div>
        </div>
      </div>

      {sync.canDraw ? (
      <WhiteboardToolsDock
        open={toolsOpen}
        onOpen={() => setToolsOpen(true)}
        onClose={() => setToolsOpen(false)}
      >
        <WhiteboardToolbar
          tool={sync.tool}
          color={sync.color}
          width={sync.width}
          colors={theme.colors}
          canUndo={sync.canUndo}
          canRedo={sync.canRedo}
          onToolChange={sync.setTool}
          onColorChange={sync.setColor}
          onWidthChange={sync.setWidth}
          onUndo={sync.undo}
          onRedo={sync.redo}
          onClear={() => setClearOpen(true)}
        />
      </WhiteboardToolsDock>
      ) : null}

      <WhiteboardMembersModal
        isOpen={membersOpen}
        board={sync.board}
        canManage={sync.canManage && !profile?.isDemo}
        onClose={() => setMembersOpen(false)}
        onChanged={(next) => sync.setBoard(next)}
      />
      <WhiteboardDetailsDrawer
        board={sync.board}
        pageId={sync.pageId ?? undefined}
        open={detailsOpen}
        currentUserId={profile?.id}
        onClose={() => setDetailsOpen(false)}
      />
      <WhiteboardExportModal
        isOpen={exportOpen}
        pages={sync.pages}
        currentPageId={sync.pageId}
        downloading={exporting}
        savingPng={savingPng}
        canSaveImage={sync.canSaveImage}
        onClose={() => {
          if (!exporting && !savingPng) setExportOpen(false);
        }}
        onDownload={(format, pageIds) => void handleExport(format, pageIds)}
        onSavePng={(pageIds) => void handleSavePng(pageIds)}
      />

      <SaveSnapshotModal
        isOpen={leaveOpen && sync.canSaveImage}
        saving={leaving}
        canSave={sync.canSaveImage}
        onSave={() => void handleSaveAndLeave()}
        onSkip={() => void handleSkipAndLeave()}
        onStay={() => {
          if (leaving) return;
          guard.clearDestination();
          setLeaveOpen(false);
        }}
      />
      <DeleteConfirmModal
        isOpen={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          sync.clearBoard();
          setClearOpen(false);
        }}
        title="Clear the whole board?"
        message="Every stroke on this board will be removed. This cannot be undone."
        confirmLabel="Clear board"
      />
    </div>
  );
}
