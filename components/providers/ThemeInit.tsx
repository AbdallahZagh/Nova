"use client";

import { useEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme";

/** Syncs theme from storage on mount (handles client navigations). */
export function ThemeInit() {
  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  return null;
}
