import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomDrawer } from "@/components/BottomDrawer";
import type { WhiteboardPage } from "@/api/whiteboards";
import { useAppPalette } from "@/theme/useAppPalette";
import type { WhiteboardExportFormat } from "@/whiteboard/export";

type PageScope = "current" | "all" | "selected";

const FORMATS: {
  value: WhiteboardExportFormat;
  label: string;
  hint: string;
}[] = [
  { value: "pdf", label: "PDF", hint: "One document" },
  { value: "png", label: "PNG", hint: "Image, ZIP if several" },
  { value: "zip", label: "ZIP", hint: "PNG per page" },
];

export function WhiteboardExportDrawer({
  visible,
  pages,
  currentPageId,
  downloading,
  savingPng,
  canSaveImage,
  onClose,
  onDownload,
  onSavePng,
}: {
  visible: boolean;
  pages: WhiteboardPage[];
  currentPageId?: string | null;
  downloading?: boolean;
  savingPng?: boolean;
  canSaveImage?: boolean;
  onClose: () => void;
  onDownload: (format: WhiteboardExportFormat, pageIds: string[]) => void;
  onSavePng?: (pageIds: string[]) => void;
}) {
  const { palette } = useAppPalette();
  const [format, setFormat] = useState<WhiteboardExportFormat>("pdf");
  const [scope, setScope] = useState<PageScope>(
    pages.length > 1 ? "all" : "current",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [],
  );

  useEffect(() => {
    if (!visible) return;
    setFormat("pdf");
    setScope(pages.length > 1 ? "all" : "current");
    setSelectedIds(
      currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [],
    );
    // Reset form when the drawer opens, not when pages update after saving a PNG.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pageIds = useMemo(() => {
    if (scope === "current") {
      return currentPageId ? [currentPageId] : pages[0] ? [pages[0].id] : [];
    }
    if (scope === "all") return pages.map((page) => page.id);
    return selectedIds;
  }, [currentPageId, pages, scope, selectedIds]);

  const selectedReady = pageIds.filter((id) =>
    pages.some((page) => page.id === id && page.snapshot),
  );
  const missingIds = pageIds.filter(
    (id) => !pages.some((page) => page.id === id && page.snapshot),
  );
  const busy = downloading || savingPng;
  const canDownload = selectedReady.length > 0 && !busy;

  return (
    <BottomDrawer
      visible={visible}
      title="Download"
      subtitle="Choose a file type and which pages to include."
      closeDisabled={busy}
      onClose={onClose}
      footer={
        missingIds.length > 0 && canSaveImage && onSavePng ? (
          <Pressable
            disabled={busy}
            onPress={() => onSavePng(missingIds)}
            className="min-h-[50px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
          >
            <Text className="font-black text-white">
              {savingPng ? "Saving PNG..." : "Save as PNG"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={!canDownload}
            onPress={() => onDownload(format, pageIds)}
            className="min-h-[50px] items-center justify-center rounded-nova bg-accent disabled:opacity-50 dark:bg-dark-accent"
          >
            <Text className="font-black text-white">
              {downloading ? "Downloading..." : "Download"}
            </Text>
          </Pressable>
        )
      }
    >
      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          File type
        </Text>
        <View className="flex-row gap-2">
          {FORMATS.map((item) => {
            const active = format === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setFormat(item.value)}
                className={`flex-1 rounded-nova border px-3 py-3 ${
                  active
                    ? "border-accent/50 bg-accent/15 dark:border-dark-accent/50 dark:bg-dark-accent/15"
                    : "border-glass bg-glass-button dark:border-dark-glass dark:bg-dark-glass-button"
                }`}
              >
                <Text
                  className={`text-sm font-black ${
                    active
                      ? "text-accent dark:text-dark-accent"
                      : "text-primary dark:text-dark-primary"
                  }`}
                >
                  {item.label}
                </Text>
                <Text className="mt-1 text-[11px] text-muted dark:text-dark-muted">
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-[1.4px] text-muted dark:text-dark-muted">
          Pages
        </Text>
        {(
          [
            ["current", "Current page"],
            ["all", "All pages"],
            ["selected", "Select pages"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setScope(value)}
            className="flex-row items-center gap-3 py-2.5"
          >
            <Ionicons
              name={scope === value ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={scope === value ? palette.accent : palette.muted}
            />
            <Text className="font-extrabold text-primary dark:text-dark-primary">
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {scope === "selected"
        ? pages.map((page, index) => {
            const checked = selectedIds.includes(page.id);
            const saved = Boolean(page.snapshot);
            return (
              <Pressable
                key={page.id}
                disabled={!saved && !canSaveImage}
                onPress={() =>
                  setSelectedIds((current) =>
                    checked
                      ? current.filter((id) => id !== page.id)
                      : [...current, page.id],
                  )
                }
                className="flex-row items-center gap-3 py-2"
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={18}
                  color={
                    !saved
                      ? palette.muted
                      : checked
                        ? palette.accent
                        : palette.primary
                  }
                />
                <Text
                  className={`flex-1 font-bold ${
                    saved
                      ? "text-primary dark:text-dark-primary"
                      : "text-muted dark:text-dark-muted"
                  }`}
                >
                  Page {index + 1}
                </Text>
                {!saved ? (
                  <Text className="text-[11px] text-muted dark:text-dark-muted">
                    No image yet
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        : null}

      {missingIds.length > 0 ? (
        <Text className="text-xs text-muted dark:text-dark-muted">
          {canSaveImage
            ? "Some selected pages have no saved image yet. Save them as PNG first, then download."
            : "Some selected pages have no saved image yet. Ask an admin to save them as PNG first."}
        </Text>
      ) : format === "png" && selectedReady.length > 1 ? (
        <Text className="text-xs text-muted dark:text-dark-muted">
          Several PNG pages download together as a ZIP.
        </Text>
      ) : null}
    </BottomDrawer>
  );
}
