import { cn } from "@/lib/cn";

export type FieldVariant = "glass" | "soft" | "minimal";

export const inputVariants: Record<FieldVariant, string> = {
  glass:
    "w-full rounded-xl border border-glass bg-glass-button/75 px-4 py-2.5 text-sm text-primary placeholder:text-primary/40 outline-none transition-all duration-200 focus:border-accent/60 focus:bg-glass-button focus:shadow-[0_0_15px_rgba(230,106,23,0.15)]",
  soft:
    "w-full rounded-xl border border-glass bg-glass-button/50 backdrop-blur-xl px-4 py-2.5 text-sm text-primary placeholder:text-primary/40 outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/20",
  minimal:
    "w-full border-0 border-b border-glass bg-transparent px-0 py-2 text-sm text-primary placeholder:text-primary/40 outline-none transition focus:border-accent",
};

export type SelectVariant = "glass" | "compact" | "minimal";

export const DROPDOWN_MENU_MAX_HEIGHT = 192;

export const selectTriggerVariants: Record<SelectVariant, string> = {
  glass: cn(inputVariants.glass, "flex cursor-pointer items-center justify-between gap-2 text-left"),
  compact:
    "flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-glass bg-glass-button px-2.5 py-1.5 text-xs text-primary outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20",
  minimal:
    "flex w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-glass bg-transparent px-0 py-2 text-sm text-primary outline-none transition focus:border-accent",
};

export const selectMenuVariants: Record<SelectVariant, string> = {
  glass:
    "z-50 max-h-48 w-full overflow-y-auto rounded-xl border border-glass bg-sidebar p-1.5 shadow-xl shadow-black/50 backdrop-blur-2xl",
  compact:
    "z-50 max-h-48 w-full min-w-32 overflow-y-auto rounded-lg border border-glass bg-sidebar/95 p-1 shadow-lg shadow-black/40 backdrop-blur-xl",
  minimal:
    "z-50 max-h-48 w-full overflow-y-auto rounded-lg border border-glass bg-glass-card p-1 backdrop-blur-xl",
};

export type MultiSelectVariant = "glass" | "pill" | "outline";

export const multiSelectTriggerVariants: Record<MultiSelectVariant, string> = {
  glass: cn(inputVariants.glass, "flex cursor-pointer items-center justify-between gap-2"),
  pill: cn(inputVariants.soft, "flex cursor-pointer items-center justify-between gap-2"),
  outline: cn(
    inputVariants.glass,
    "flex cursor-pointer items-center justify-between gap-2 border-accent/25 focus:border-accent/50",
  ),
};

export const multiSelectMenuVariants: Record<MultiSelectVariant, string> = {
  glass:
    "z-50 max-h-48 w-full overflow-y-auto rounded-xl border border-glass bg-sidebar p-1.5 shadow-xl shadow-black/50 backdrop-blur-2xl",
  pill:
    "z-50 max-h-48 w-full overflow-y-auto rounded-2xl border border-glass bg-glass-card p-2 shadow-lg backdrop-blur-xl",
  outline:
    "z-50 max-h-48 w-full overflow-y-auto rounded-xl border-2 border-accent/20 bg-sidebar p-1.5 shadow-xl backdrop-blur-2xl",
};

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};
