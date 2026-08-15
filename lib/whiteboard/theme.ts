const NAMED_HEX: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
};

function expandShortHex(value: string) {
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
}

function rgbToHex(r: number, g: number, b: number) {
  const hex = (part: number) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function toHexColor(color: string) {
  const value = color.trim().toLowerCase();
  if (NAMED_HEX[value]) return NAMED_HEX[value];
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return expandShortHex(value);

  const commaRgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (commaRgb) {
    return rgbToHex(Number(commaRgb[1]), Number(commaRgb[2]), Number(commaRgb[3]));
  }
  const spaceRgb = value.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/i);
  if (spaceRgb) {
    return rgbToHex(Number(spaceRgb[1]), Number(spaceRgb[2]), Number(spaceRgb[3]));
  }

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillStyle = color;
        const normalized = String(ctx.fillStyle);
        if (normalized && normalized.toLowerCase() !== value) {
          return toHexColor(normalized);
        }
      }
    } catch {
      // Ignore probe failures and keep the parsed/fallback value.
    }
  }

  return value.startsWith("#") ? value : "#000000";
}

export function sameColor(a: string, b: string) {
  return toHexColor(a) === toHexColor(b);
}

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function readBoardTokens() {
  if (typeof window === "undefined") {
    return {
      paper: "#161312",
      surround: "#1c1816",
      ink: "#e8e3e0",
      colors: ["#e8e3e0", "#e66a17", "#ff0000", "#00ff00", "#ffff00", "#ffffff"],
    };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    paper: readVar(styles, "--bg-main", "#161312"),
    surround: readVar(styles, "--bg-sidebar", "#1c1816"),
    ink: readVar(styles, "--text-primary", "#e8e3e0"),
    colors: [
      readVar(styles, "--text-primary", "#e8e3e0"),
      readVar(styles, "--accent", "#e66a17"),
      readVar(styles, "--danger", "#ff0000"),
      readVar(styles, "--success", "#00ff00"),
      readVar(styles, "--warning", "#ffff00"),
      "#ffffff",
    ],
  };
}
