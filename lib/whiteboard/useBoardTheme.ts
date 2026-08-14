"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readTheme, subscribeToTheme } from "@/lib/theme";
import { readBoardTokens } from "@/lib/whiteboard/theme";

function getSnapshot() {
  if (typeof window === "undefined") return "dark" as const;
  return readTheme();
}

export function useBoardTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getSnapshot, () => "dark" as const);
  return useMemo(
    () => ({
      theme,
      dark: theme === "dark",
      ...readBoardTokens(),
    }),
    [theme],
  );
}
