export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "taskflow-theme-change";

/** Clears legacy inline overrides so globals.css variables apply. */
const THEME_CSS_VARS = [
  "--bg-main",
  "--bg-sidebar",
  "--glass-card",
  "--glass-border",
  "--accent",
  "--text-primary",
] as const;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;

  for (const key of THEME_CSS_VARS) {
    root.style.removeProperty(key);
  }

  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function subscribeToTheme(callback: () => void) {
  const handler = () => callback();
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
