export const lightColors = {
  main: "#f5f1ec",
  sidebar: "#ede6db",
  primary: "#1c1208",
  muted: "rgba(28, 18, 8, 0.64)",
  subtle: "rgba(28, 18, 8, 0.42)",
  accent: "#c56010",
  accentPressed: "#9f4b0a",
  glass: "rgba(42, 22, 6, 0.14)",
  glassCard: "rgba(42, 22, 6, 0.05)",
  glassButton: "rgba(42, 22, 6, 0.07)",
  danger: "#dc2626",
  success: "#16a34a",
  warning: "#d97706",
  white: "#ffffff",
};

export const darkColors = {
  main: "#161312",
  sidebar: "#1c1816",
  primary: "#e8e3e0",
  muted: "rgba(232, 227, 224, 0.64)",
  subtle: "rgba(232, 227, 224, 0.42)",
  accent: "#e66a17",
  accentPressed: "#bd5410",
  glass: "rgba(255, 255, 255, 0.05)",
  glassCard: "rgba(230, 106, 23, 0.05)",
  glassButton: "rgba(79, 69, 62, 0.20)",
  danger: "#ff0000",
  success: "#00ff00",
  warning: "#ffff00",
  white: "#ffffff",
};

export function getPalette(mode: string | undefined | null) {
  return mode === "dark" ? darkColors : lightColors;
}

export const colors = lightColors;
