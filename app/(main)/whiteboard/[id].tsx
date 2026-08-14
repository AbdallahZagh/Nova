import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ConfirmationPopup } from "@/components/ConfirmationPopup";
import { SaveSnapshotPopup } from "@/components/whiteboard/SaveSnapshotPopup";
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
} from "@/components/whiteboard/WhiteboardCanvas";
import { WhiteboardActivityDrawer } from "@/components/whiteboard/WhiteboardActivityDrawer";
import { WhiteboardCommentsDrawer } from "@/components/whiteboard/WhiteboardCommentsDrawer";
import { WhiteboardMembersDrawer } from "@/components/whiteboard/WhiteboardMembersDrawer";
import { WhiteboardPresenceStack } from "@/components/whiteboard/WhiteboardPresenceStack";
import { WhiteboardToolbar } from "@/components/whiteboard/WhiteboardToolbar";
import { WhiteboardToolsDock } from "@/components/whiteboard/WhiteboardToolsDock";
import { ActionSheet } from "@/components/ActionSheet";
import { WhiteboardEditorSkeleton } from "@/components/Skeleton";
import { useWhiteboardSync } from "@/hooks/useWhiteboardSync";
import { useAuthStore } from "@/store/useAuthStore";
import { useSnackbarStore } from "@/store/useSnackbarStore";
import { useAppPalette } from "@/theme/useAppPalette";
import {
  WHITEBOARD_LEAVE_BACK,
  useWhiteboardLeave,
} from "@/whiteboard/WhiteboardLeaveContext";
import { exportErrorMessage, saveWhiteboardExport } from "@/whiteboard/export";

export default function WhiteboardEditorScreen() {
  const { dark, palette } = useAppPalette();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const sync = useWhiteboardSync(id);
  const showSnackbar = useSnackbarStore((state) => state.showSnackbar);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const canvasRef = useRef<WhiteboardCanvasHandle>(null);
  const navigation = useNavigation();
  const { register } = useWhiteboardLeave();
  const allowLeaveRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const requestLeaveRef = useRef<(href?: string) => void>(() => {});
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "zip" | "png" | null>(null);
  const paper = palette.main;
  const surround = palette.sidebar;
  const ink = palette.primary;
  const colors = [
    palette.primary,
    palette.accent,
    palette.danger,
    palette.success,
    palette.warning,
    palette.white,
  ];
  const lastInkRef = useRef(ink);
  const inkReadyRef = useRef(false);

  useEffect(() => {
    if (!inkReadyRef.current) {
      sync.setColor(ink);
      inkReadyRef.current = true;
      lastInkRef.current = ink;
      return;
    }
    if (sync.color === lastInkRef.current) {
      sync.setColor(ink);
    }
    lastInkRef.current = ink;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      requestLeaveRef.current(WHITEBOARD_LEAVE_BACK);
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      requestLeaveRef.current(WHITEBOARD_LEAVE_BACK);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    register({
      tryLeave: (href) => {
        if (allowLeaveRef.current) return false;
        requestLeaveRef.current(href);
        return true;
      },
    });
    return () => register(null);
  }, [register]);

  const leaveBoard = () => {
    allowLeaveRef.current = true;
    register(null);
    const dest = pendingRef.current;
    pendingRef.current = null;
    if (!dest || dest === WHITEBOARD_LEAVE_BACK) {
      router.back();
      return;
    }
    router.push(dest as never);
  };

  const handleSaveAndLeave = async () => {
    setLeaving(true);
    try {
      const base64 = await canvasRef.current?.capturePng();
      if (!base64) throw new Error("Could not capture the board");
      const FileSystem = await import("expo-file-system/legacy");
      const path = `${FileSystem.cacheDirectory}whiteboard-${id}.png`;
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uri = path.startsWith("file://") ? path : `file://${path}`;
      await sync.saveSnapshot({
        uri,
        name: "snapshot.png",
        type: "image/png",
      });
      leaveBoard();
    } catch {
      setLeaving(false);
      showSnackbar({
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
      leaveBoard();
    } catch {
      setLeaving(false);
    }
  };

  const requestLeave = (href?: string) => {
    pendingRef.current = href ?? pendingRef.current ?? WHITEBOARD_LEAVE_BACK;
    if (sync.canSaveImage) {
      setLeaveOpen(true);
      return;
    }
    void handleSkipAndLeave();
  };
  requestLeaveRef.current = requestLeave;

  const handleExport = async (format: "pdf" | "zip" | "png") => {
    if (!sync.board || exporting) return;
    setExporting(format);
    setMoreOpen(false);
    try {
      const filename = await saveWhiteboardExport(
        sync.board.id,
        format,
        format === "png" ? sync.pageId ?? undefined : undefined,
      );
      showSnackbar({
        variant: "success",
        title: "Downloaded",
        message: `${filename} was saved to this device.`,
      });
    } catch (error) {
      showSnackbar({
        variant: "error",
        title: "Export failed",
        message: exportErrorMessage(error),
      });
    } finally {
      setExporting(null);
    }
  };

  if (sync.loading) {
    return <WhiteboardEditorSkeleton />;
  }

  if (sync.error || !sync.board) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 p-6"
        style={{ backgroundColor: palette.main }}
      >
        <Text className="text-lg font-black text-primary dark:text-dark-primary">
          Whiteboard not found
        </Text>
        <Text className="text-sm text-muted dark:text-dark-muted">
          {sync.error || "This board may have been deleted."}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text className="font-black text-accent dark:text-dark-accent">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const saveLabel =
    sync.saveState === "saving"
      ? "Saving…"
      : sync.saveState === "error"
        ? "Save failed"
        : sync.saveState === "saved"
          ? "Saved"
          : "Live";

  return (
    <View className="flex-1" style={{ backgroundColor: palette.main }}>
      <View className="flex-row items-center gap-2 px-2 pt-2">
        <Pressable
          onPress={() => requestLeave(WHITEBOARD_LEAVE_BACK)}
          className="p-1.5"
        >
          <Ionicons name="arrow-back" size={20} color={palette.primary} />
        </Pressable>
        <Text className="min-w-0 flex-1 text-base font-black text-primary dark:text-dark-primary" numberOfLines={1}>
          {sync.board.title || "Untitled board"}
        </Text>
        <WhiteboardPresenceStack people={sync.people} muted={palette.muted} />
        <Pressable
          onPress={() => setMembersOpen(true)}
          className="h-8 w-8 shrink-0 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
        >
          <Ionicons name="people-outline" size={14} color={palette.primary} />
        </Pressable>
        <Pressable
          onPress={() => setMoreOpen(true)}
          className="h-8 w-8 shrink-0 items-center justify-center rounded-nova border border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={palette.primary} />
        </Pressable>
        <Text className="shrink-0 text-[11px] font-bold text-muted dark:text-dark-muted">{saveLabel}</Text>
      </View>

      <View className="flex-row items-center gap-2 px-2 pb-1">
        {sync.pages.map((page, index) => (
          <Pressable
            key={page.id}
            onPress={() => void sync.switchPage(page.id)}
            className={`rounded-full px-3 py-1 ${
              page.id === sync.pageId
                ? "bg-accent dark:bg-dark-accent"
                : "bg-glass-button dark:bg-dark-glass-button"
            }`}
          >
            <Text
              className={`text-[11px] font-black ${
                page.id === sync.pageId
                  ? "text-white"
                  : "text-primary dark:text-dark-primary"
              }`}
            >
              {index + 1}
            </Text>
          </Pressable>
        ))}
        {sync.canDraw ? (
          <Pressable
            onPress={() => void sync.addPage()}
            className="rounded-full bg-glass-button px-2 py-1 dark:bg-dark-glass-button"
          >
            <Ionicons name="add" size={14} color={palette.primary} />
          </Pressable>
        ) : null}
        {sync.canManage && sync.pages.length > 1 && sync.pageId ? (
          <Pressable
            onPress={() => void sync.removePage(sync.pageId!)}
            className="p-1"
          >
            <Ionicons name="trash-outline" size={16} color={palette.danger} />
          </Pressable>
        ) : null}
      </View>

      <View className="min-h-0 flex-1 px-2 pb-2 pt-2">
        <View className="flex-1">
          <WhiteboardCanvas
            ref={canvasRef}
            document={sync.document}
            remoteDrafts={sync.remoteDrafts}
            presence={sync.presence}
            tool={sync.tool}
            color={sync.color}
            width={sync.width}
            paper={paper}
            surround={surround}
            dark={dark}
            onStrokeMove={sync.broadcastDraft}
            onStrokeComplete={sync.addStroke}
            onCursorMove={sync.broadcastCursor}
            onInteract={() => setToolsOpen(false)}
            readOnly={!sync.canDraw}
          />
          {sync.canDraw ? (
          <WhiteboardToolsDock
            open={toolsOpen}
            accent={palette.accent}
            onOpen={() => setToolsOpen(true)}
          >
            <WhiteboardToolbar
              overlay
              tool={sync.tool}
              color={sync.color}
              width={sync.width}
              colors={colors}
              canUndo={sync.canUndo}
              canRedo={sync.canRedo}
              accent={palette.accent}
              muted={palette.muted}
              danger={palette.danger}
              track={palette.glass}
              onToolChange={sync.setTool}
              onColorChange={sync.setColor}
              onWidthChange={sync.setWidth}
              onUndo={sync.undo}
              onRedo={sync.redo}
              onClear={() => setClearOpen(true)}
            />
          </WhiteboardToolsDock>
          ) : null}
        </View>
      </View>

      <WhiteboardMembersDrawer
        visible={membersOpen}
        board={sync.board}
        canManage={sync.canManage}
        onClose={() => setMembersOpen(false)}
        onChanged={(next) => sync.setBoard(next)}
      />
      <WhiteboardActivityDrawer
        boardId={sync.board.id}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <WhiteboardCommentsDrawer
        board={sync.board}
        pageId={sync.pageId ?? undefined}
        visible={commentsOpen}
        currentUserId={currentUserId}
        onClose={() => setCommentsOpen(false)}
      />
      <ActionSheet
        visible={moreOpen}
        title="Board"
        onClose={() => setMoreOpen(false)}
        actions={[
          {
            key: "history",
            icon: "time-outline",
            label: "History",
            onPress: () => {
              setMoreOpen(false);
              setHistoryOpen(true);
            },
          },
          {
            key: "comments",
            icon: "chatbubble-outline",
            label: "Comments",
            onPress: () => {
              setMoreOpen(false);
              setCommentsOpen(true);
            },
          },
          {
            key: "png",
            icon: "image-outline",
            label: exporting === "png" ? "Downloading..." : "Download PNG",
            disabled: exporting !== null,
            onPress: () => void handleExport("png"),
          },
          {
            key: "pdf",
            icon: "document-outline",
            label: exporting === "pdf" ? "Downloading..." : "Download PDF",
            disabled: exporting !== null,
            onPress: () => void handleExport("pdf"),
          },
          {
            key: "zip",
            icon: "download-outline",
            label: exporting === "zip" ? "Downloading..." : "Download ZIP",
            disabled: exporting !== null,
            onPress: () => void handleExport("zip"),
          },
        ]}
      />

      <SaveSnapshotPopup
        visible={leaveOpen && sync.canSaveImage}
        saving={leaving}
        canSave={sync.canSaveImage}
        onSave={() => void handleSaveAndLeave()}
        onSkip={() => void handleSkipAndLeave()}
        onStay={() => {
          if (leaving) return;
          pendingRef.current = null;
          setLeaveOpen(false);
        }}
      />
      <ConfirmationPopup
        visible={clearOpen}
        title="Clear the whole board?"
        message="Every stroke on this board will be removed. This cannot be undone."
        confirmLabel="Clear board"
        icon="trash-outline"
        variant="danger"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          sync.clearBoard();
          setClearOpen(false);
        }}
      />
    </View>
  );
}
